import { Hono } from "hono";
import { z } from "zod";
import { withRls } from "@maple/db";
import { CODING_KINDS, appealInput, campaignInput, fundInput } from "@maple/core";
import { createCoding, listCoding, updateCoding } from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { validate } from "../validate";

const kindParam = z.object({ orgId: z.string().uuid(), kind: z.enum(CODING_KINDS) });
const kindIdParam = kindParam.extend({ id: z.string().uuid() });
const anyCoding = z.union([appealInput, campaignInput, fundInput]);

/** Funds, campaigns and appeals share one shape, so one set of routes serves all three. */
export const coding = new Hono<ApiEnv>()
  .get("/:orgId/coding/:kind", validate("param", kindParam), validate("query", z.object({ includeInactive: z.coerce.boolean().default(false) })), async (c) => {
    const { orgId, kind } = c.req.valid("param");
    const { includeInactive } = c.req.valid("query");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listCoding(tx, kind, orgId, { includeInactive }));
    return c.json({ items });
  })
  .post("/:orgId/coding/:kind", validate("param", kindParam), validate("json", anyCoding), async (c) => {
    const { orgId, kind } = c.req.valid("param");
    const input = c.req.valid("json");
    const created = await withRls(getDb(), c.get("claims"), (tx) => createCoding(tx, kind, orgId, input));
    return c.json(created, 201);
  })
  .patch("/:orgId/coding/:kind/:id", validate("param", kindIdParam), validate("json", anyCoding), async (c) => {
    const { orgId, kind, id } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => updateCoding(tx, kind, orgId, id, c.req.valid("json")));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });
