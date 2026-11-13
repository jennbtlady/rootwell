import { Hono } from "hono";
import { z } from "zod";
import { withRls } from "@maple/db";
import { receiptSettingsInput, resolvedReceipts, sponsorAnimalInput } from "@maple/core";
import { deleteAnimal, getGiftTribute, getReceiptSettings, listAnimals, saveAnimal, saveReceiptSettings, type AnimalResult } from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { validate } from "../validate";

const orgParam = z.object({ orgId: z.string().uuid() });
const idParam = orgParam.extend({ id: z.string().uuid() });

const MESSAGES: Record<Exclude<AnimalResult, { ok: true }>["reason"], [string, 400 | 403 | 404 | 409]> = {
  forbidden: ["Only owners and admins can change the animals list.", 403],
  not_found: ["Not found", 404],
  bad_photo: ["Upload the photo again.", 400],
  bad_fund: ["Choose one of your funds.", 400],
  has_gifts: ["This animal has gifts, so it stays in your records. Turn off \"Show on giving pages\" instead.", 409],
};

/**
 * Fundraising Phase 2, signed in: the animals donors can sponsor, the automatic receipt, and
 * a gift's tribute. Gated to the Donations module in app.ts.
 */
export const donationRoutes = new Hono<ApiEnv>()
  .get("/:orgId/animals", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    return c.json({ items: await withRls(getDb(), c.get("claims"), (tx) => listAnimals(tx, orgId)) });
  })
  .post("/:orgId/animals", validate("param", orgParam), validate("json", sponsorAnimalInput), async (c) => {
    const { orgId } = c.req.valid("param");
    const r = await withRls(getDb(), c.get("claims"), (tx) => saveAnimal(tx, orgId, null, c.req.valid("json")));
    if (!r.ok) return c.json({ error: MESSAGES[r.reason][0] }, MESSAGES[r.reason][1]);
    return c.json({ id: r.id }, 201);
  })
  .put("/:orgId/animals/:id", validate("param", idParam), validate("json", sponsorAnimalInput), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const r = await withRls(getDb(), c.get("claims"), (tx) => saveAnimal(tx, orgId, id, c.req.valid("json")));
    if (!r.ok) return c.json({ error: MESSAGES[r.reason][0] }, MESSAGES[r.reason][1]);
    return c.json({ ok: true });
  })
  .delete("/:orgId/animals/:id", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const r = await withRls(getDb(), c.get("claims"), (tx) => deleteAnimal(tx, orgId, id));
    if (!r.ok) return c.json({ error: MESSAGES[r.reason][0] }, MESSAGES[r.reason][1]);
    return c.body(null, 204);
  })

  .get("/:orgId/receipts", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const r = await withRls(getDb(), c.get("claims"), (tx) => getReceiptSettings(tx, orgId));
    if (!r) return c.json({ error: "Not found" }, 404);
    return c.json({ settings: r.settings, resolved: resolvedReceipts(r.settings, r.org), orgName: r.org.name, ein: r.org.ein });
  })
  .put("/:orgId/receipts", validate("param", orgParam), validate("json", receiptSettingsInput), async (c) => {
    const { orgId } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => saveReceiptSettings(tx, orgId, c.req.valid("json")));
    if (!ok) return c.json({ error: "Only owners and admins can change receipts." }, 403);
    return c.json({ ok: true });
  })

  .get("/:orgId/gifts/:id/tribute", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const t = await withRls(getDb(), c.get("claims"), (tx) => getGiftTribute(tx, orgId, id));
    if (!t) return c.json({ error: "Not found" }, 404);
    return c.json(t);
  });
