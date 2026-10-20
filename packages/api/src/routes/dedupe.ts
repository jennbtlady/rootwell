import { Hono } from "hono";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { withRls } from "@maple/db";
import { CONSTITUENT_FILTERS, GIFT_FILTERS, dataHealth, getDuplicate, listDuplicates, listGifts, listMerges, markNotDuplicate, mergeConstituents, reopenDuplicate, scanDuplicates, unmerge } from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { validate } from "../validate";

const orgParam = z.object({ orgId: z.string().uuid() });
const idParam = orgParam.extend({ id: z.string().uuid() });
export const mergeInput = z.object({
  survivorId: z.string().uuid(),
  mergedId: z.string().uuid(),
  decisions: z.record(z.string().max(40), z.enum(["a", "b"])).default({}),
});

export const dedupe = new Hono<ApiEnv>()
  .get("/:orgId/health", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const health = await withRls(getDb(), c.get("claims"), (tx) => dataHealth(tx, orgId));
    return c.json(health);
  })
  .get("/:orgId/duplicates", validate("param", orgParam), validate("query", z.object({ status: z.enum(["open", "not_duplicate"]).default("open") })), async (c) => {
    const { orgId } = c.req.valid("param");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listDuplicates(tx, orgId, c.req.valid("query").status));
    return c.json({ items });
  })
  .post("/:orgId/duplicates/scan", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const open = await withRls(getDb(), c.get("claims"), (tx) => scanDuplicates(tx, orgId));
    return c.json({ open });
  })
  .get("/:orgId/duplicates/:id", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const pair = await withRls(getDb(), c.get("claims"), (tx) => getDuplicate(tx, orgId, id));
    if (!pair) return c.json({ error: "Not found" }, 404);
    return c.json(pair);
  })
  .patch("/:orgId/duplicates/:id", validate("param", idParam), validate("json", z.object({ status: z.enum(["open", "not_duplicate"]) })), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const claims = c.get("claims");
    const { status } = c.req.valid("json");
    const ok = await withRls(getDb(), claims, (tx) => (status === "not_duplicate" ? markNotDuplicate(tx, orgId, id, claims.sub) : reopenDuplicate(tx, orgId, id)));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  })
  .post("/:orgId/merges", validate("param", orgParam), validate("json", mergeInput), async (c) => {
    const { orgId } = c.req.valid("param");
    const input = c.req.valid("json");
    const result = await withRls(getDb(), c.get("claims"), async (tx) => {
      // Both records must be visible in this org before the function runs.
      const visible = await tx.execute(sql`select count(*)::int as n from constituents where org_id = ${orgId} and id in (${input.survivorId}::uuid, ${input.mergedId}::uuid)`);
      if (Number((visible[0] as { n: number }).n) !== 2) return null;
      return mergeConstituents(tx, input.survivorId, input.mergedId, input.decisions);
    });
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result, 201);
  })
  .get("/:orgId/merges", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listMerges(tx, orgId));
    return c.json({ items });
  })
  .post("/:orgId/merges/:id/undo", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), async (tx) => {
      const merges = await listMerges(tx, orgId, 500);
      if (!merges.some((m) => m.id === id)) return false;
      await unmerge(tx, id);
      return true;
    });
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  })
  .get("/:orgId/gifts", validate("param", orgParam), validate("query", z.object({ filter: z.enum(GIFT_FILTERS).optional(), limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) })), async (c) => {
    const { orgId } = c.req.valid("param");
    const result = await withRls(getDb(), c.get("claims"), (tx) => listGifts(tx, orgId, c.req.valid("query")));
    return c.json(result);
  });

export const constituentFilterQuery = z.enum(CONSTITUENT_FILTERS).optional();
