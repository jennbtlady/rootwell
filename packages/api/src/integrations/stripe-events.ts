import type Stripe from "stripe";
import { systemClaims, withPublic, withRls } from "@maple/db";
import {
  disconnectIntegration,
  setStripeReady,
  endRecurringPlan,
  ensureRecurringPlan,
  failWebhookEvent,
  finishWebhookEvent,
  orgForIntegrationAccount,
  recordOnlineGift,
  recordPayoutBatch,
  recordReversal,
  recordWebhookEvent,
  type OnlineDonor,
} from "@maple/core/services";
import { getDb } from "../db";
import type { PaymentInfo, StripeGateway } from "./stripe-gateway";

type Outcome = { outcome: string; needsAttention?: boolean };

const donorFrom = (p: Pick<PaymentInfo, "name" | "email" | "address">): OnlineDonor => ({
  name: p.name,
  email: p.email,
  address: p.address ? { line1: p.address.line1, line2: p.address.line2, city: p.address.city, state: p.address.state, postalCode: p.address.postal_code, country: p.address.country } : null,
});

const meta = (m: Record<string, string> | null | undefined) => ({
  orgId: m?.orgId ?? null,
  fundId: m?.fundId || null,
  campaignId: m?.campaignId || null,
  coverFeeCents: Number(m?.coverFeeCents ?? 0) || 0,
});

/**
 * Receives one verified Stripe event for a connected account.
 * Returns the HTTP status for Stripe: 200 when done or safely ignored, 500 to ask for a retry.
 */
export async function receiveStripeEvent(gw: StripeGateway, event: Stripe.Event): Promise<{ status: 200 | 500; body: Record<string, unknown> }> {
  const account = event.account;
  if (!account) return { status: 200, body: { ignored: "not a connected account event" } };
  const db = getDb();
  const orgId = await withPublic(db, (tx) => orgForIntegrationAccount(tx, "stripe", account));
  if (!orgId) return { status: 200, body: { ignored: "account not connected" } };

  const claims = systemClaims(orgId);
  const rec = await withRls(db, claims, (tx) => recordWebhookEvent(tx, orgId, { provider: "stripe", eventId: event.id, type: event.type, payload: slim(event) }));
  if (rec.alreadyProcessed) return { status: 200, body: { duplicate: true } };

  try {
    const result = await handle(gw, orgId, account, event);
    await withRls(db, claims, (tx) => finishWebhookEvent(tx, rec.id, result));
    return { status: 200, body: { outcome: result.outcome } };
  } catch (e) {
    // Keep the message short and free of donor details; Stripe will retry.
    const message = e instanceof Error ? e.message.slice(0, 300) : "Unknown error";
    await withRls(db, claims, (tx) => failWebhookEvent(tx, rec.id, message)).catch(() => undefined);
    return { status: 500, body: { error: "Could not process the event" } };
  }
}

async function handle(gw: StripeGateway, orgId: string, account: string, event: Stripe.Event): Promise<Outcome> {
  const db = getDb();
  const claims = systemClaims(orgId);
  const obj = event.data.object as unknown as Record<string, unknown>;

  switch (event.type) {
    case "checkout.session.completed": {
      const m = meta(obj.metadata as Record<string, string>);
      if (m.orgId && m.orgId !== orgId) return { outcome: "metadata names a different organization", needsAttention: true };
      if (obj.mode === "subscription") {
        const subscriptionId = String(obj.subscription ?? "");
        const cd = (obj.customer_details ?? {}) as { name?: string; email?: string; address?: PaymentInfo["address"] };
        await withRls(db, claims, (tx) =>
          ensureRecurringPlan(tx, orgId, {
            subscriptionId,
            amountCents: Number(obj.amount_total ?? 0),
            startedAt: event.created,
            donor: donorFrom({ name: cd.name ?? null, email: cd.email ?? null, address: cd.address ?? null }),
            fundId: m.fundId,
            campaignId: m.campaignId,
          }),
        );
        return { outcome: "monthly gift set up" };
      }
      const pi = String(obj.payment_intent ?? "");
      if (!pi) return { outcome: "no payment on this checkout", needsAttention: true };
      const p = await gw.paymentDetails(account, pi);
      const r = await withRls(db, claims, (tx) =>
        recordOnlineGift(tx, orgId, {
          externalId: p.chargeId, platform: "stripe", amountCents: p.amount, feeCents: p.fee, netCents: p.net, feeCoveredCents: m.coverFeeCents,
          paidAt: p.created, donor: donorFrom(p), fundId: m.fundId, campaignId: m.campaignId,
        }),
      );
      return { outcome: r.created ? (r.matched ? "gift added to an existing donor" : "gift added with a new donor") : "gift already recorded" };
    }

    case "invoice.paid": {
      if (Number(obj.amount_paid ?? 0) <= 0) return { outcome: "nothing was charged" };
      const inv = await gw.invoiceDetails(account, String(obj.id));
      const m = meta(inv.metadata);
      if (m.orgId && m.orgId !== orgId) return { outcome: "metadata names a different organization", needsAttention: true };
      const r = await withRls(db, claims, async (tx) => {
        const plan = await ensureRecurringPlan(tx, orgId, {
          subscriptionId: inv.subscriptionId, amountCents: inv.amount, startedAt: inv.created, donor: donorFrom(inv), fundId: m.fundId, campaignId: m.campaignId,
        });
        return recordOnlineGift(tx, orgId, {
          externalId: inv.chargeId, platform: "stripe", amountCents: inv.amount, feeCents: inv.fee, netCents: inv.net, feeCoveredCents: m.coverFeeCents,
          paidAt: inv.created, donor: donorFrom(inv), fundId: m.fundId, campaignId: m.campaignId, recurringPlanId: plan.planId, constituentId: plan.constituentId,
        });
      });
      return { outcome: r.created ? "monthly gift added" : "gift already recorded" };
    }

    case "customer.subscription.deleted": {
      const ended = await withRls(db, claims, (tx) => endRecurringPlan(tx, orgId, String(obj.id)));
      return { outcome: ended ? "monthly gift ended" : "no matching monthly gift" };
    }

    // A refund, whole or part. Each Stripe refund becomes one negative entry that reverses
    // part of the gift (fundraising Phase 2). Ask Stripe for the refunds rather than trust the
    // event body, so a partial refund arriving twice is still one entry.
    case "charge.refunded": {
      const chargeId = String(obj.id);
      const refunds = await gw.chargeRefunds(account, chargeId);
      let made = 0;
      let known = true;
      for (const rf of refunds) {
        const r = await withRls(db, claims, (tx) => recordReversal(tx, orgId, { chargeId, externalId: rf.id, amountCents: rf.amount, at: rf.created, kind: "refund" }));
        if (!r.giftId) known = false;
        if (r.created) made++;
      }
      if (!known) return { outcome: "refund for a payment we have no gift for", needsAttention: true };
      return { outcome: made ? "refund recorded against the gift" : "refund already recorded" };
    }

    // A donor's bank questions a charge. The money is on hold, so nothing changes in the books
    // yet, but someone has to answer in Stripe before the deadline.
    case "charge.dispute.created": {
      const due = Number((obj.evidence_details as { due_by?: number } | undefined)?.due_by ?? 0);
      const by = due ? ` by ${new Date(due * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}` : "";
      return { outcome: `a donor's bank disputed this gift: answer in Stripe${by}`, needsAttention: true };
    }

    // Won: nothing changes. Lost: the money goes back, so the gift gets a reversing entry.
    case "charge.dispute.closed": {
      if (obj.status === "won") return { outcome: "dispute won: the gift stands" };
      if (obj.status !== "lost") return { outcome: "dispute closed" };
      const r = await withRls(db, claims, (tx) =>
        recordReversal(tx, orgId, { chargeId: String(obj.charge), externalId: String(obj.id), amountCents: Number(obj.amount ?? 0), at: event.created, kind: "dispute" }),
      );
      if (!r.giftId) return { outcome: "lost dispute for a payment we have no gift for", needsAttention: true };
      return { outcome: "dispute lost: the gift was reversed, and Stripe charged a dispute fee", needsAttention: true };
    }

    case "payout.paid": {
      const payoutId = String(obj.id);
      const charges = await gw.payoutCharges(account, payoutId);
      const r = await withRls(db, claims, (tx) =>
        recordPayoutBatch(tx, orgId, { payoutId, arrivalDate: Number(obj.arrival_date ?? event.created), netCents: Number(obj.amount ?? 0), charges }),
      );
      if (r.missing.length) return { outcome: `deposit batch made, but ${r.missing.length} payment(s) in it have no gift yet`, needsAttention: true };
      return { outcome: `deposit batch made with ${r.attached} gift(s)` };
    }

    // The account's owner finished (or lost) Stripe's own setup. Ask Stripe rather than trust
    // the event body, so a stale event cannot turn payments back on.
    case "account.updated": {
      const { ready } = await gw.accountStatus(account);
      const changed = await withRls(db, claims, (tx) => setStripeReady(tx, orgId, ready));
      return { outcome: changed ? (ready ? "Stripe account can take payments" : "Stripe account needs more information") : "no change" };
    }

    case "account.application.deauthorized": {
      await withRls(db, claims, (tx) => disconnectIntegration(tx, orgId, "stripe"));
      return { outcome: "Stripe was disconnected from the Stripe side", needsAttention: true };
    }

    default:
      return { outcome: "ignored" };
  }
}

/** Store the event without donor contact details. The ids are enough to look it up in Stripe. */
function slim(event: Stripe.Event) {
  const o = event.data.object as unknown as Record<string, unknown>;
  return { id: event.id, type: event.type, account: event.account ?? null, created: event.created, object: { id: o.id ?? null, object: o.object ?? null, mode: o.mode ?? null } };
}
