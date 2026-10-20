import { Hono } from "hono";
import { z } from "zod";
import { withRls } from "@maple/db";
import { IMPORT_FIELDS } from "@maple/core";
import {
  appendImportRows,
  commitImport,
  createImportJob,
  decideAllReview,
  decidePerson,
  deleteImportJob,
  fixImportRow,
  getImportJob,
  listImportJobs,
  listImportPeople,
  listImportRows,
  listSavedMappings,
  prepareImport,
  rollbackImport,
  saveMapping,
  skipAllErrors,
  skipImportRow,
} from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { validate } from "../validate";

const orgParam = z.object({ orgId: z.string().uuid() });
const jobParam = orgParam.extend({ id: z.string().uuid() });
const rowParam = jobParam.extend({ row: z.coerce.number().int().min(1) });
const kind = z.enum(["constituents", "constituents_gifts"]);
const field = z.enum(IMPORT_FIELDS as [string, ...string[]]);
const mappingSchema = z.partialRecord(field, z.string().max(200));
const headerList = z.array(z.string().max(200)).min(1).max(200);

export const imports = new Hono<ApiEnv>()
  .get("/:orgId/imports", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listImportJobs(tx, orgId));
    return c.json({ items });
  })
  .post("/:orgId/imports", validate("param", orgParam), validate("json", z.object({ kind, fileName: z.string().trim().min(1).max(200), headers: headerList, expectedRows: z.number().int().min(1).max(50_000) })), async (c) => {
    const { orgId } = c.req.valid("param");
    const created = await withRls(getDb(), c.get("claims"), (tx) => createImportJob(tx, orgId, c.req.valid("json")));
    return c.json(created, 201);
  })
  .get("/:orgId/imports/:id", validate("param", jobParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const job = await withRls(getDb(), c.get("claims"), (tx) => getImportJob(tx, orgId, id));
    if (!job) return c.json({ error: "Not found" }, 404);
    return c.json(job);
  })
  .delete("/:orgId/imports/:id", validate("param", jobParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => deleteImportJob(tx, orgId, id));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  })
  .post("/:orgId/imports/:id/rows", validate("param", jobParam), validate("json", z.object({ offset: z.number().int().min(0), rows: z.array(z.array(z.string().max(5000)).max(200)).min(1).max(1000) })), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const { offset, rows } = c.req.valid("json");
    const uploaded = await withRls(getDb(), c.get("claims"), (tx) => appendImportRows(tx, orgId, id, offset, rows));
    if (uploaded < 0) return c.json({ error: "Not found" }, 404);
    return c.json({ uploaded });
  })
  .put("/:orgId/imports/:id/mapping", validate("param", jobParam), validate("json", z.object({ mapping: mappingSchema, saveAs: z.string().trim().min(1).max(80).optional() })), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const { mapping, saveAs } = c.req.valid("json");
    const job = await withRls(getDb(), c.get("claims"), async (tx) => {
      const j = await prepareImport(tx, orgId, id, mapping);
      if (j && saveAs) await saveMapping(tx, orgId, { name: saveAs, kind: j.kind, headers: j.headers, mapping });
      return j;
    });
    if (!job) return c.json({ error: "Not found" }, 404);
    return c.json(job);
  })
  .get("/:orgId/imports/:id/rows", validate("param", jobParam), validate("query", z.object({ action: z.enum(["create", "match", "review", "skip", "error"]).optional(), warnings: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) })), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const q = c.req.valid("query");
    const result = await withRls(getDb(), c.get("claims"), (tx) => listImportRows(tx, orgId, id, { action: q.action, withWarnings: q.warnings, limit: q.limit, offset: q.offset }));
    return c.json(result);
  })
  .patch("/:orgId/imports/:id/rows/:row", validate("param", rowParam), validate("json", z.object({ fields: z.partialRecord(field, z.string().max(5000)).optional(), skip: z.boolean().optional() })), async (c) => {
    const { orgId, id, row } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await withRls(getDb(), c.get("claims"), async (tx) => {
      if (body.skip !== undefined) return (await skipImportRow(tx, orgId, id, row, body.skip)) ? { ok: true } : null;
      if (body.fields) return fixImportRow(tx, orgId, id, row, body.fields);
      return null;
    });
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .post("/:orgId/imports/:id/skip-errors", validate("param", jobParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const n = await withRls(getDb(), c.get("claims"), (tx) => skipAllErrors(tx, orgId, id));
    return c.json({ skipped: n });
  })
  .get("/:orgId/imports/:id/people", validate("param", jobParam), validate("query", z.object({ scope: z.enum(["review", "match", "create", "skip"]).default("review"), limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) })), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const q = c.req.valid("query");
    const result = await withRls(getDb(), c.get("claims"), (tx) => listImportPeople(tx, orgId, id, q.scope, q.limit, q.offset));
    return c.json(result);
  })
  .post("/:orgId/imports/:id/decisions", validate("param", jobParam), validate("json", z.union([
    z.object({ personKey: z.string().max(400), action: z.enum(["create", "match", "skip"]), matchId: z.string().uuid().nullish() }),
    z.object({ all: z.enum(["create", "skip", "best_match"]) }),
  ])), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await withRls(getDb(), c.get("claims"), async (tx) => {
      if ("all" in body) return { updated: await decideAllReview(tx, orgId, id, body.all) };
      return (await decidePerson(tx, orgId, id, body.personKey, body.action, body.matchId ?? null)) ? { updated: 1 } : null;
    });
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .post("/:orgId/imports/:id/commit", validate("param", jobParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const summary = await withRls(getDb(), c.get("claims"), async (tx) => ((await getImportJob(tx, orgId, id)) ? commitImport(tx, id) : null));
    if (!summary) return c.json({ error: "Not found" }, 404);
    return c.json(summary);
  })
  .post("/:orgId/imports/:id/rollback", validate("param", jobParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const summary = await withRls(getDb(), c.get("claims"), async (tx) => ((await getImportJob(tx, orgId, id)) ? rollbackImport(tx, id) : null));
    if (!summary) return c.json({ error: "Not found" }, 404);
    return c.json(summary);
  })
  .get("/:orgId/import-mappings", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listSavedMappings(tx, orgId));
    return c.json({ items });
  });
