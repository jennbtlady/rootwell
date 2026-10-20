import { Hono } from "hono";
import { z } from "zod";
import { withRls } from "@maple/db";
import { batchInput, giftEntryStandards, validateGift } from "@maple/core";
import {
  createBatch,
  createGift,
  deleteBatch,
  deleteGift,
  getBatch,
  getGift,
  getStandards,
  listAuditForRow,
  listBatches,
  postBatch,
  setStandards,
  updateBatch,
  updateGift,
} from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { validate } from "../validate";

const orgParam = z.object({ orgId: z.string().uuid() });
const idParam = orgParam.extend({ id: z.string().uuid() });
const looseBody = z.object({}).passthrough();

export const giftRoutes = new Hono<ApiEnv>()
  // standards
  .get("/:orgId/gift-standards", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const standards = await withRls(getDb(), c.get("claims"), (tx) => getStandards(tx, orgId));
    if (!standards) return c.json({ error: "Not found" }, 404);
    return c.json(standards);
  })
  .put("/:orgId/gift-standards", validate("param", orgParam), validate("json", giftEntryStandards), async (c) => {
    const { orgId } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => setStandards(tx, orgId, c.req.valid("json")));
    if (!ok) return c.json({ error: "You do not have permission to do that." }, 403);
    return c.json({ ok: true });
  })
  // batches
  .get("/:orgId/batches", validate("param", orgParam), validate("query", z.object({ status: z.enum(["open", "posted"]).optional() })), async (c) => {
    const { orgId } = c.req.valid("param");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listBatches(tx, orgId, { status: c.req.valid("query").status }));
    return c.json({ items });
  })
  .post("/:orgId/batches", validate("param", orgParam), validate("json", batchInput), async (c) => {
    const { orgId } = c.req.valid("param");
    const created = await withRls(getDb(), c.get("claims"), (tx) => createBatch(tx, orgId, c.req.valid("json")));
    return c.json(created, 201);
  })
  .get("/:orgId/batches/:id", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const batch = await withRls(getDb(), c.get("claims"), (tx) => getBatch(tx, orgId, id));
    if (!batch) return c.json({ error: "Not found" }, 404);
    return c.json(batch);
  })
  .patch("/:orgId/batches/:id", validate("param", idParam), validate("json", batchInput), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => updateBatch(tx, orgId, id, c.req.valid("json")));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  })
  .delete("/:orgId/batches/:id", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => deleteBatch(tx, orgId, id));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  })
  .post("/:orgId/batches/:id/post", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const result = await withRls(getDb(), c.get("claims"), async (tx) => {
      const b = await getBatch(tx, orgId, id);
      if (!b) return null;
      return postBatch(tx, id);
    });
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  // gifts
  // The gift body is validated by the org's standards engine, not a fixed schema, so the
  // route accepts any object and validateGift() reports field issues.
  .post("/:orgId/gifts", validate("param", orgParam), validate("json", looseBody), async (c) => {
    const { orgId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await withRls(getDb(), c.get("claims"), async (tx) => {
      const standards = await getStandards(tx, orgId);
      if (!standards) return null;
      const { gift, issues } = validateGift(standards, body);
      if (!gift) return { issues };
      return { created: await createGift(tx, orgId, gift) };
    });
    if (!result) return c.json({ error: "Not found" }, 404);
    if ("issues" in result) return c.json({ error: "Invalid input", issues: result.issues }, 400);
    return c.json(result.created, 201);
  })
  .get("/:orgId/gifts/:id", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const gift = await withRls(getDb(), c.get("claims"), (tx) => getGift(tx, orgId, id));
    if (!gift) return c.json({ error: "Not found" }, 404);
    return c.json(gift);
  })
  .patch("/:orgId/gifts/:id", validate("param", idParam), validate("json", looseBody), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await withRls(getDb(), c.get("claims"), async (tx) => {
      const standards = await getStandards(tx, orgId);
      if (!standards) return null;
      const { gift, issues } = validateGift(standards, body);
      if (!gift) return { issues };
      return { ok: await updateGift(tx, orgId, id, gift) };
    });
    if (!result) return c.json({ error: "Not found" }, 404);
    if ("issues" in result) return c.json({ error: "Invalid input", issues: result.issues }, 400);
    if (!result.ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  })
  .delete("/:orgId/gifts/:id", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => deleteGift(tx, orgId, id));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  })
  .get("/:orgId/gifts/:id/audit", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listAuditForRow(tx, orgId, "gifts", id));
    return c.json({ items });
  });
