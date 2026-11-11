import { Hono } from "hono";
import { z } from "zod";
import { withRls } from "@maple/db";
import { accountingExportQuery, accountingSettings, depositSummaryCsv, donationPageInput, journalCsv, journalLines, mailchimpConfigInput, mailchimpKeyInput } from "@maple/core";
import {
  SlugTakenError,
  accountNames,
  canManageIntegrations,
  createDonationPage,
  deleteDonationPage,
  disconnectIntegration,
  exportBatches,
  getAccountingSettings,
  getDonationPage,
  getIntegration,
  integrationCredentials,
  integrationHealth,
  listDonationPages,
  listIntegrations,
  mailchimpContacts,
  managedTagNames,
  recordIntegrationRun,
  resolveWebhookAttention,
  saveIntegration,
  setAccountingSettings,
  updateDonationPage,
  updateIntegrationConfig,
} from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { requireTwoStep } from "../auth";
import { validate } from "../validate";
import { SimulatedStripeGateway, decryptSecret, encryptSecret, mailchimpGateway, signState, stripeGateway, verifyState } from "../integrations";

const orgParam = z.object({ orgId: z.string().uuid() });
const idParam = orgParam.extend({ id: z.string().uuid() });
const NO = { error: "Only owners and admins, signed in with two-step sign-in, can change integrations." } as const;

const origin = (url: string) => process.env.NEXT_PUBLIC_APP_URL ?? new URL(url).origin;

/** Runs `fn` with up to `n` in flight. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

export const integrationRoutes = new Hono<ApiEnv>()
  .get("/:orgId/integrations", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listIntegrations(tx, orgId));
    return c.json({ items, stripeMode: stripeGateway().mode });
  })
  .get("/:orgId/integrations/health", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    return c.json(await withRls(getDb(), c.get("claims"), (tx) => integrationHealth(tx, orgId)));
  })
  .post("/:orgId/integrations/events/:id/resolve", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => resolveWebhookAttention(tx, orgId, id));
    if (!ok) return c.json(NO, 403);
    return c.json({ ok: true });
  })

  // ---- Stripe
  .post("/:orgId/integrations/stripe/connect", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const claims = c.get("claims");
    if (!(await withRls(getDb(), claims, (tx) => canManageIntegrations(tx, orgId)))) return c.json(NO, 403);
    const state = signState({ orgId, userId: claims.sub });
    return c.json({ url: stripeGateway().connectUrl(state, `${origin(c.req.url)}/app/stripe-return`) });
  })
  .post("/:orgId/integrations/stripe/complete", validate("param", orgParam), validate("json", z.object({ code: z.string().min(1).max(200), state: z.string().min(1).max(1000) })), async (c) => {
    const { orgId } = c.req.valid("param");
    const claims = c.get("claims");
    const body = c.req.valid("json");
    const st = verifyState(body.state);
    if (!st || st.orgId !== orgId || st.userId !== claims.sub) return c.json({ error: "That connection link expired or was for someone else. Start again." }, 400);
    if (!(await withRls(getDb(), claims, (tx) => canManageIntegrations(tx, orgId)))) return c.json(NO, 403);
    let accountId: string;
    try {
      ({ accountId } = await stripeGateway().completeConnect(body.code));
    } catch {
      return c.json({ error: "Stripe did not accept the connection. Start again." }, 400);
    }
    await withRls(getDb(), claims, (tx) => saveIntegration(tx, orgId, "stripe", { accountId, credentials: null }));
    return c.json({ ok: true, accountId });
  })
  .delete("/:orgId/integrations/stripe", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const claims = c.get("claims");
    if (!(await withRls(getDb(), claims, (tx) => canManageIntegrations(tx, orgId)))) return c.json(NO, 403);
    const cur = await withRls(getDb(), claims, (tx) => getIntegration(tx, orgId, "stripe"));
    if (cur?.accountId) await stripeGateway().deauthorize(cur.accountId).catch(() => undefined);
    await withRls(getDb(), claims, (tx) => disconnectIntegration(tx, orgId, "stripe"));
    return c.body(null, 204);
  })
  .post("/:orgId/integrations/stripe/simulate-payout", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const claims = c.get("claims");
    const gw = stripeGateway();
    if (!(gw instanceof SimulatedStripeGateway)) return c.json({ error: "Only available in test mode." }, 404);
    if (!(await withRls(getDb(), claims, (tx) => canManageIntegrations(tx, orgId)))) return c.json(NO, 403);
    const cur = await withRls(getDb(), claims, (tx) => getIntegration(tx, orgId, "stripe"));
    if (!cur?.accountId || cur.status !== "connected") return c.json({ error: "Connect Stripe first." }, 409);
    return c.json(await gw.payout(cur.accountId));
  })

  // ---- Mailchimp
  .put("/:orgId/integrations/mailchimp/key", validate("param", orgParam), validate("json", mailchimpKeyInput), async (c) => {
    const { orgId } = c.req.valid("param");
    const claims = c.get("claims");
    if (!(await withRls(getDb(), claims, (tx) => canManageIntegrations(tx, orgId)))) return c.json(NO, 403);
    const { apiKey } = c.req.valid("json");
    let accountName: string;
    try {
      ({ accountName } = await mailchimpGateway(apiKey).ping());
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Mailchimp did not accept that key." }, 400);
    }
    await withRls(getDb(), claims, (tx) => saveIntegration(tx, orgId, "mailchimp", { accountId: accountName, credentials: encryptSecret(apiKey) }));
    return c.json({ ok: true, accountName });
  })
  .get("/:orgId/integrations/mailchimp/audiences", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const box = await withRls(getDb(), c.get("claims"), (tx) => integrationCredentials(tx, orgId, "mailchimp"));
    if (!box) return c.json({ error: "Connect Mailchimp first." }, 409);
    try {
      return c.json({ items: await mailchimpGateway(decryptSecret(box)).audiences() });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Mailchimp did not answer." }, 502);
    }
  })
  .patch("/:orgId/integrations/mailchimp/config", validate("param", orgParam), validate("json", mailchimpConfigInput), async (c) => {
    const { orgId } = c.req.valid("param");
    const claims = c.get("claims");
    if (!(await withRls(getDb(), claims, (tx) => canManageIntegrations(tx, orgId)))) return c.json(NO, 403);
    const ok = await withRls(getDb(), claims, (tx) => updateIntegrationConfig(tx, orgId, "mailchimp", c.req.valid("json")));
    if (!ok) return c.json({ error: "Connect Mailchimp first." }, 409);
    return c.json({ ok: true });
  })
  .post("/:orgId/integrations/mailchimp/sync", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const claims = c.get("claims");
    const db = getDb();
    if (!(await withRls(db, claims, (tx) => canManageIntegrations(tx, orgId)))) return c.json(NO, 403);
    const { integ, box, contacts, managed } = await withRls(db, claims, async (tx) => ({
      integ: await getIntegration(tx, orgId, "mailchimp"),
      box: await integrationCredentials(tx, orgId, "mailchimp"),
      contacts: await mailchimpContacts(tx, orgId),
      managed: await managedTagNames(tx, orgId),
    }));
    const listId = integ?.config.listId as string | undefined;
    if (!box || !integ || integ.status === "disconnected") return c.json({ error: "Connect Mailchimp first." }, 409);
    if (!listId) return c.json({ error: "Choose an audience first." }, 409);
    // Without the org's confirmation that people agreed to email, new contacts are added as
    // "transactional": stored in Mailchimp, but not sent marketing email.
    const statusIfNew = integ.config.permissionConfirmed ? "subscribed" : "transactional";
    const gw = mailchimpGateway(decryptSecret(box));
    const summary = { sent: 0, unsubscribed: 0, failed: 0 };
    let firstError: string | null = null;
    await pool(contacts, 5, async (p) => {
      try {
        if (p.unsubscribe) {
          await gw.unsubscribe(listId, p.email);
          summary.unsubscribed++;
          return;
        }
        await gw.upsert(listId, { email: p.email, firstName: p.firstName, lastName: p.lastName, statusIfNew });
        const have = new Set(p.tags);
        await gw.setTags(listId, p.email, managed.map((name) => ({ name, active: have.has(name) })));
        summary.sent++;
      } catch (e) {
        summary.failed++;
        firstError ??= e instanceof Error ? e.message : "Unknown error";
      }
    });
    const allFailed = contacts.length > 0 && summary.failed === contacts.length;
    await withRls(db, claims, (tx) => recordIntegrationRun(tx, orgId, "mailchimp", allFailed ? { error: firstError } : { summary: { ...summary, ...(firstError ? { firstError } : {}) } }));
    return c.json({ ...summary, error: allFailed ? firstError : null });
  })
  .delete("/:orgId/integrations/mailchimp", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const claims = c.get("claims");
    if (!(await withRls(getDb(), claims, (tx) => canManageIntegrations(tx, orgId)))) return c.json(NO, 403);
    await withRls(getDb(), claims, (tx) => disconnectIntegration(tx, orgId, "mailchimp"));
    return c.body(null, 204);
  })

  // ---- donation pages
  .get("/:orgId/donation-pages", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    return c.json({ items: await withRls(getDb(), c.get("claims"), (tx) => listDonationPages(tx, orgId)) });
  })
  .post("/:orgId/donation-pages", validate("param", orgParam), validate("json", donationPageInput), async (c) => {
    const { orgId } = c.req.valid("param");
    try {
      return c.json(await withRls(getDb(), c.get("claims"), (tx) => createDonationPage(tx, orgId, c.req.valid("json"))), 201);
    } catch (e) {
      if (e instanceof SlugTakenError) return c.json({ error: e.message }, 409);
      throw e;
    }
  })
  .get("/:orgId/donation-pages/:id", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const p = await withRls(getDb(), c.get("claims"), (tx) => getDonationPage(tx, orgId, id));
    if (!p) return c.json({ error: "Not found" }, 404);
    return c.json(p);
  })
  .put("/:orgId/donation-pages/:id", validate("param", idParam), validate("json", donationPageInput), async (c) => {
    const { orgId, id } = c.req.valid("param");
    try {
      const ok = await withRls(getDb(), c.get("claims"), (tx) => updateDonationPage(tx, orgId, id, c.req.valid("json")));
      if (!ok) return c.json({ error: "Not found" }, 404);
      return c.json({ ok: true });
    } catch (e) {
      if (e instanceof SlugTakenError) return c.json({ error: e.message }, 409);
      throw e;
    }
  })
  .delete("/:orgId/donation-pages/:id", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => deleteDonationPage(tx, orgId, id));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  })

  // ---- accounting
  .get("/:orgId/accounting", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const s = await withRls(getDb(), c.get("claims"), (tx) => getAccountingSettings(tx, orgId));
    if (!s) return c.json({ error: "Not found" }, 404);
    return c.json(s);
  })
  .put("/:orgId/accounting", validate("param", orgParam), validate("json", accountingSettings), async (c) => {
    const { orgId } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => setAccountingSettings(tx, orgId, c.req.valid("json")));
    if (!ok) return c.json({ error: "You do not have permission to do that." }, 403);
    return c.json({ ok: true });
  })
  .get(
    "/:orgId/accounting/export",
    requireTwoStep,
    validate("param", orgParam),
    validate("query", accountingExportQuery.partial().extend({ batchId: z.string().uuid().optional(), format: z.enum(["journal", "deposits"]).default("journal") })),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const q = c.req.valid("query");
      if (!q.batchId && (!q.from || !q.to)) return c.json({ error: "Choose a start and end date." }, 400);
      const { batches, settings } = await withRls(getDb(), c.get("claims"), async (tx) => {
        const settings = await getAccountingSettings(tx, orgId);
        return { settings, batches: settings ? await exportBatches(tx, orgId, { from: q.from, to: q.to, batchId: q.batchId }) : [] };
      });
      if (!settings) return c.json({ error: "Not found" }, 404);
      const csv = q.format === "deposits" ? depositSummaryCsv(batches) : journalCsv(journalLines(batches, accountNames(settings)));
      const name = q.batchId ? `batch-${q.format}` : `${q.format}-${q.from}-to-${q.to}`;
      return c.body(csv, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="quickbooks-${name}.csv"` });
    },
  );
