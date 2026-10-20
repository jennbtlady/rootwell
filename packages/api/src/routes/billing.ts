import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type Stripe from "stripe";
import { systemClaims, withRls } from "@maple/db";
import { applySubscription, canManageBilling, finishWebhookEvent, getBilling, getOrg, failWebhookEvent, orgWritable, recordWebhookEvent } from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { validate } from "../validate";
import { SimulatedBillingGateway, billingGateway, subscriptionFromEvent } from "../integrations";

const orgParam = z.object({ orgId: z.string().uuid() });
const origin = (url: string) => process.env.NEXT_PUBLIC_APP_URL ?? new URL(url).origin;
const NOT_OWNER = { error: "Only the owner, signed in with two-step sign-in, can change the subscription." } as const;

export const READ_ONLY_MESSAGE =
  "This account is read only because the subscription ended. You can still see and export everything. The owner can restart the subscription under Settings, Billing.";

/**
 * Writes a lapsed organization may still make: hand the account over, manage who has
 * access, restart billing, and get its data out. Everything else is refused here with a
 * plain message. The database refuses it too (restrictive RLS policies); this only
 * explains why.
 */
const ALLOWED_WHILE_READ_ONLY = [
  /^\/members(\/|$)/,
  /^\/transfer-ownership$/,
  /^\/billing(\/|$)/,
  /^\/board-links(\/|$)/,
  /^\/board-settings$/,
  /^\/integrations(\/|$)/,
  /^\/dashboard\/refresh$/,
  /^\/acks\/preview$/,
  /^\/statements\/\d{4}\/pdf$/,
  /^$/, // DELETE of the org itself (sample org removal)
];

export const readOnlyGuard = createMiddleware<ApiEnv>(async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  const m = /^\/api\/v1\/orgs\/([0-9a-f-]{36})(\/.*)?$/.exec(c.req.path);
  if (!m) return next();
  const rest = m[2] ?? "";
  if (ALLOWED_WHILE_READ_ONLY.some((r) => r.test(rest))) return next();
  const writable = await withRls(getDb(), c.get("claims"), (tx) => orgWritable(tx, m[1]!));
  if (!writable) return c.json({ error: READ_ONLY_MESSAGE, readOnly: true }, 403);
  return next();
});

export const billingRoutes = new Hono<ApiEnv>()
  .get("/:orgId/billing", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const b = await withRls(getDb(), c.get("claims"), (tx) => getBilling(tx, orgId));
    if (!b) return c.json({ error: "Not found" }, 404);
    const { stripeCustomerId: _c, ...rest } = b;
    return c.json({ ...rest, mode: billingGateway().mode });
  })
  .post("/:orgId/billing/checkout", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const claims = c.get("claims");
    const { ok, billing, org } = await withRls(getDb(), claims, async (tx) => ({ ok: await canManageBilling(tx, orgId), billing: await getBilling(tx, orgId), org: await getOrg(tx, orgId) }));
    if (!ok || !billing || !org) return c.json(NOT_OWNER, 403);
    if (billing.isSample) return c.json({ error: "The sample organization does not need a subscription." }, 409);
    if (billing.hasSubscription && !["canceled", "unpaid", "incomplete_expired"].includes(billing.status)) return c.json({ error: "You already have a subscription. Use Manage billing to change it." }, 409);
    const base = `${origin(c.req.url)}/app/orgs/${orgId}/settings/billing`;
    const url = await billingGateway().checkoutUrl({ orgId, orgName: org.name, customerId: billing.stripeCustomerId, email: null, trialEndsAt: billing.trialEndsAt, successUrl: `${base}?subscribed=1`, cancelUrl: base });
    return c.json({ url });
  })
  .post("/:orgId/billing/portal", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const claims = c.get("claims");
    const { ok, billing } = await withRls(getDb(), claims, async (tx) => ({ ok: await canManageBilling(tx, orgId), billing: await getBilling(tx, orgId) }));
    if (!ok || !billing) return c.json(NOT_OWNER, 403);
    if (!billing.stripeCustomerId) return c.json({ error: "Start a subscription first." }, 409);
    return c.json({ url: await billingGateway().portalUrl(billing.stripeCustomerId, `${origin(c.req.url)}/app/orgs/${orgId}/settings/billing`) });
  });

/** Stripe Billing events for our own subscriptions. Signature first, then the org from metadata we set. */
export const billingWebhook = new Hono<ApiEnv>().post("/stripe-billing", async (c) => {
  const raw = await c.req.text();
  const gw = billingGateway();
  let event: Stripe.Event;
  try {
    event = gw.verifyWebhook(raw, c.req.header("stripe-signature") ?? null);
  } catch {
    return c.json({ error: "Signature check failed" }, 400);
  }
  let sub;
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.mode !== "subscription" || !s.subscription) return c.json({ ignored: true });
    sub = await gw.subscription(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
    sub.orgId ??= s.client_reference_id ?? null;
  } else if (event.type.startsWith("customer.subscription.")) {
    sub = subscriptionFromEvent(event.data.object as Stripe.Subscription);
    if (event.type === "customer.subscription.deleted") sub.status = "canceled";
  } else return c.json({ ignored: true });
  const orgId = sub.orgId;
  if (!orgId || !/^[0-9a-f-]{36}$/.test(orgId)) return c.json({ ignored: "no organization on this subscription" });

  const db = getDb();
  const claims = systemClaims(orgId);
  const rec = await withRls(db, claims, (tx) => recordWebhookEvent(tx, orgId, { provider: "stripe", eventId: event.id, type: event.type, payload: { id: event.id, type: event.type, subscription: sub.subscriptionId, status: sub.status } }));
  if (rec.alreadyProcessed) return c.json({ duplicate: true });
  try {
    await withRls(db, claims, async (tx) => {
      await applySubscription(tx, orgId, { customerId: sub.customerId, subscriptionId: sub.subscriptionId, status: sub.status, trialEnd: sub.trialEnd });
      await finishWebhookEvent(tx, rec.id, { outcome: `subscription ${sub.status}` });
    });
    return c.json({ status: sub.status });
  } catch (e) {
    await withRls(db, claims, (tx) => failWebhookEvent(tx, rec.id, e instanceof Error ? e.message.slice(0, 300) : "Unknown error")).catch(() => undefined);
    return c.json({ error: "Could not process the event" }, 500);
  }
});

// ---- test-mode stand-in for Stripe Checkout and the customer portal

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f4f4f6;color:#121c2d;line-height:1.5}
  main{max-width:28rem;margin:2rem auto;padding:1.5rem;background:#fff;border-radius:8px;border:1px solid #cacdd8}
  .banner{background:#fef5ee;border:1px solid #f47c22;padding:.5rem .75rem;border-radius:4px;font-size:.875rem;margin-bottom:1rem}
  button{margin-top:.75rem;width:100%;padding:.75rem;font-size:1rem;font-weight:600;background:#0263e0;color:#fff;border:0;border-radius:4px;cursor:pointer}
  button.secondary{background:#fff;color:#121c2d;border:1px solid #8891aa}
  button:focus-visible,a:focus-visible{outline:3px solid #0263e0;outline-offset:2px}
</style></head><body><main>
<p class="banner"><strong>Test mode.</strong> This is a stand-in for Stripe Billing. No real card is charged.</p>
${body}
</main></body></html>`;
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const sim = () => {
  const g = billingGateway();
  return g instanceof SimulatedBillingGateway ? g : null;
};

export const billingSim = new Hono<ApiEnv>()
  .use("*", async (c, next) => {
    if (!sim()) return c.notFound();
    await next();
  })
  .get("/checkout/:id", (c) => {
    const ch = sim()!.checkout(c.req.param("id"));
    if (!ch || ch.done) return c.html(page("Checkout finished", "<h1>This checkout is finished</h1>"), 404);
    const trial = ch.trialEnd ? `<p>Your free trial continues until ${new Date(ch.trialEnd * 1000).toLocaleDateString("en-US", { dateStyle: "long" })}. The first charge is on that day.</p>` : "";
    return c.html(
      page(
        "Subscribe",
        `<h1>Subscribe: ${esc(ch.orgName)}</h1><p>Maple Ledger, billed monthly.</p>${trial}
<form method="post" action="/api/v1/billing-sim/checkout/${esc(ch.id)}"><button type="submit">Subscribe with test card</button></form>
<p><a href="${esc(ch.cancelUrl)}">Cancel and go back</a></p>`,
      ),
    );
  })
  .post("/checkout/:id", async (c) => c.redirect(await sim()!.pay(c.req.param("id")), 303))
  .get("/portal/:id", (c) => {
    const p = sim()!.portal(c.req.param("id"));
    if (!p) return c.html(page("Not found", "<h1>This link expired</h1>"), 404);
    const id = esc(c.req.param("id"));
    const actions = p.sub
      ? `<p>Subscription status: <strong>${esc(p.sub.status)}</strong></p>
<form method="post" action="/api/v1/billing-sim/portal/${id}/canceled"><button type="submit">Cancel subscription</button></form>
<form method="post" action="/api/v1/billing-sim/portal/${id}/past_due"><button type="submit" class="secondary">Test: a payment fails</button></form>
<form method="post" action="/api/v1/billing-sim/portal/${id}/unpaid"><button type="submit" class="secondary">Test: Stripe gives up on the payment</button></form>
<form method="post" action="/api/v1/billing-sim/portal/${id}/active"><button type="submit" class="secondary">Test: payment goes through</button></form>`
      : "<p>No active subscription.</p>";
    return c.html(page("Manage billing", `<h1>Manage billing</h1>${actions}<p><a href="${esc(p.returnUrl)}">Back to Maple Ledger</a></p>`));
  })
  .post("/portal/:id/:status", async (c) => {
    const g = sim()!;
    const p = g.portal(c.req.param("id"));
    const status = c.req.param("status");
    if (!p?.sub || !["active", "past_due", "unpaid", "canceled"].includes(status)) return c.text("Not found", 404);
    await g.setStatus(p.sub.id, status as "active");
    return c.redirect(p.returnUrl, 303);
  });
