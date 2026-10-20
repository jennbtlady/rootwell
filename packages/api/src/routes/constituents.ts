import { Hono } from "hono";
import { z } from "zod";
import { withRls } from "@maple/db";
import { constituentInput, constituentSearch, interactionInput, relationshipInput, tagInput } from "@maple/core";
import { CONSTITUENT_FILTERS } from "@maple/core/services";
import {
  addInteraction,
  addRelationship,
  createConstituent,
  createTag,
  deleteConstituent,
  deleteInteraction,
  findDuplicates,
  getConstituent,
  listAuditForRow,
  listConstituents,
  listGiftsForConstituent,
  listInteractions,
  listTags,
  removeRelationship,
  setConstituentTags,
  updateConstituent,
} from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { validate } from "../validate";

const orgParam = z.object({ orgId: z.string().uuid() });
const idParam = orgParam.extend({ id: z.string().uuid() });
const subParam = idParam.extend({ subId: z.string().uuid() });
const listQuery = constituentSearch.extend({ offset: z.coerce.number().int().min(0).default(0), filter: z.enum(CONSTITUENT_FILTERS).optional() });
const duplicateQuery = z.object({
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  orgName: z.string().trim().max(200).optional(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  postalCode: z.string().trim().max(20).optional(),
  excludeId: z.string().uuid().optional(),
});

export const constituents = new Hono<ApiEnv>()
  .get("/:orgId/constituents", validate("param", orgParam), validate("query", listQuery), async (c) => {
    const { orgId } = c.req.valid("param");
    const { q, limit, offset, filter } = c.req.valid("query");
    const result = await withRls(getDb(), c.get("claims"), (tx) => listConstituents(tx, orgId, { q, limit, offset, filter }));
    return c.json(result);
  })
  .get("/:orgId/constituents/duplicates", validate("param", orgParam), validate("query", duplicateQuery), async (c) => {
    const { orgId } = c.req.valid("param");
    const candidates = await withRls(getDb(), c.get("claims"), (tx) => findDuplicates(tx, orgId, c.req.valid("query")));
    return c.json({ candidates });
  })
  .post("/:orgId/constituents", validate("param", orgParam), validate("json", constituentInput), async (c) => {
    const { orgId } = c.req.valid("param");
    const created = await withRls(getDb(), c.get("claims"), (tx) => createConstituent(tx, orgId, c.req.valid("json")));
    return c.json(created, 201);
  })
  .get("/:orgId/constituents/:id", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const item = await withRls(getDb(), c.get("claims"), (tx) => getConstituent(tx, orgId, id));
    if (!item) return c.json({ error: "Not found" }, 404);
    return c.json(item);
  })
  .patch("/:orgId/constituents/:id", validate("param", idParam), validate("json", constituentInput), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => updateConstituent(tx, orgId, id, c.req.valid("json")));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  })
  .delete("/:orgId/constituents/:id", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => deleteConstituent(tx, orgId, id));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  })
  .get("/:orgId/constituents/:id/gifts", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listGiftsForConstituent(tx, orgId, id));
    return c.json({ items });
  })
  .get("/:orgId/constituents/:id/audit", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listAuditForRow(tx, orgId, "constituents", id));
    return c.json({ items });
  })
  // interactions
  .get("/:orgId/constituents/:id/interactions", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listInteractions(tx, orgId, id));
    return c.json({ items });
  })
  .post("/:orgId/constituents/:id/interactions", validate("param", idParam), validate("json", interactionInput), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const claims = c.get("claims");
    const created = await withRls(getDb(), claims, (tx) => addInteraction(tx, orgId, id, c.req.valid("json"), claims.sub));
    return c.json(created, 201);
  })
  .delete("/:orgId/constituents/:id/interactions/:subId", validate("param", subParam), async (c) => {
    const { orgId, subId } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => deleteInteraction(tx, orgId, subId));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  })
  // relationships
  .post("/:orgId/constituents/:id/relationships", validate("param", idParam), validate("json", relationshipInput), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const created = await withRls(getDb(), c.get("claims"), (tx) => addRelationship(tx, orgId, id, c.req.valid("json")));
    return c.json(created, 201);
  })
  .delete("/:orgId/constituents/:id/relationships/:subId", validate("param", subParam), async (c) => {
    const { orgId, subId } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => removeRelationship(tx, orgId, subId));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  })
  // tags
  .put("/:orgId/constituents/:id/tags", validate("param", idParam), validate("json", z.object({ tagIds: z.array(z.string().uuid()).max(50) })), async (c) => {
    const { orgId, id } = c.req.valid("param");
    await withRls(getDb(), c.get("claims"), (tx) => setConstituentTags(tx, orgId, id, c.req.valid("json").tagIds));
    return c.json({ ok: true });
  })
  .get("/:orgId/tags", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listTags(tx, orgId));
    return c.json({ items });
  })
  .post("/:orgId/tags", validate("param", orgParam), validate("json", tagInput), async (c) => {
    const { orgId } = c.req.valid("param");
    const created = await withRls(getDb(), c.get("claims"), (tx) => createTag(tx, orgId, c.req.valid("json").name));
    return c.json(created, 201);
  });
