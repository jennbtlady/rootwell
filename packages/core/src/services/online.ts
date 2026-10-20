import { sql } from "drizzle-orm";
import type { Tx } from "./types";
import { findDuplicates } from "./constituents";

/**
 * Online giving: turns a verified payment from a platform (Stripe today) into a gift.
 * Every function here runs as the system actor for one organization, from the webhook
 * route. They are idempotent: the same payment arriving twice makes one gift.
 */

export type OnlineDonor = {
  name: string | null;
  email: string | null;
  address: { line1: string | null; line2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null } | null;
};

const cents = (n: number) => (n / 100).toFixed(2);

/** "Ana María de la Cruz" becomes first "Ana María de la", last "Cruz". Good enough to match on, and staff can fix it. */
export function splitName(full: string | null): { first: string | null; last: string | null } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: null, last: parts[0]! };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1]! };
}

export const textArray = (xs: string[]) => sql`array[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::text[]`;
export const uuidArray = (xs: string[]) => (xs.length ? sql`array[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::uuid[]` : sql`'{}'::uuid[]`);

async function lock(tx: Tx, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

/**
 * Finds the donor among existing constituents, or adds them.
 * A match needs exactly one candidate scoring 0.9 or more, the same rule the importer uses.
 * Anything weaker creates a new record, and the duplicate scan will suggest a merge if needed.
 */
export async function matchOrCreateDonor(tx: Tx, orgId: string, donor: OnlineDonor): Promise<{ constituentId: string; matched: boolean }> {
  const { first, last } = splitName(donor.name);
  const email = donor.email?.trim().toLowerCase() || null;
  if (email) await lock(tx, `donor:${orgId}:${email}`);
  const candidates = await findDuplicates(tx, orgId, { firstName: first, lastName: last, email, postalCode: donor.address?.postalCode ?? null });
  const strong = candidates.filter((c) => c.score >= 0.9);
  if (strong.length === 1) return { constituentId: strong[0]!.id, matched: true };

  const r = await tx.execute(sql`
    insert into constituents (org_id, type, first_name, last_name, source)
    values (${orgId}, 'person', ${first}, ${last ?? email ?? "Online donor"}, 'Online giving')
    returning id`);
  const id = (r[0] as { id: string }).id;
  if (email) {
    await tx.execute(sql`insert into constituent_emails (org_id, constituent_id, email, type, is_primary) values (${orgId}, ${id}, ${email}, 'home', true)`);
  }
  const a = donor.address;
  if (a && (a.line1 || a.postalCode)) {
    await tx.execute(sql`
      insert into constituent_addresses (org_id, constituent_id, line1, line2, city, state, postal_code, country, type, is_primary)
      values (${orgId}, ${id}, ${a.line1}, ${a.line2}, ${a.city}, ${a.state}, ${a.postalCode}, ${a.country ?? "US"}, 'home', true)`);
  }
  return { constituentId: id, matched: false };
}

export type OnlinePayment = {
  /** The platform's id for the money movement. Stripe: the charge id. */
  externalId: string;
  platform: "stripe";
  amountCents: number;
  feeCents: number;
  netCents: number;
  /** Part of amountCents the donor added to cover the fee. */
  feeCoveredCents: number;
  /** Unix seconds. The gift date is this day in the organization's time zone. */
  paidAt: number;
  donor: OnlineDonor;
  fundId: string | null;
  campaignId: string | null;
  recurringPlanId?: string | null;
  constituentId?: string | null;
  note?: string | null;
};

/**
 * Records a gift for a payment. Lands unposted and outside any batch; the payout later
 * groups it into a suggested batch that staff post after checking the bank deposit.
 */
export async function recordOnlineGift(tx: Tx, orgId: string, p: OnlinePayment): Promise<{ giftId: string; constituentId: string; created: boolean; matched: boolean }> {
  await lock(tx, `gift:${orgId}:${p.platform}:${p.externalId}`);
  const existing = await tx.execute(sql`select id, constituent_id from gifts where org_id = ${orgId} and external_source = 'stripe' and external_id = ${p.externalId} limit 1`);
  if (existing.length) {
    const e = existing[0] as { id: string; constituent_id: string };
    return { giftId: e.id, constituentId: e.constituent_id, created: false, matched: true };
  }
  let constituentId = p.constituentId ?? null;
  let matched = !!constituentId;
  if (!constituentId) ({ constituentId, matched } = await matchOrCreateDonor(tx, orgId, p.donor));

  // Only use a fund or campaign that belongs to this organization and is still active.
  const fund = p.fundId ? await tx.execute(sql`select id from funds where id = ${p.fundId} and org_id = ${orgId} and active`) : [];
  const campaign = p.campaignId ? await tx.execute(sql`select id from campaigns where id = ${p.campaignId} and org_id = ${orgId}`) : [];

  const r = await tx.execute(sql`
    insert into gifts (org_id, constituent_id, amount, gift_date, fund_id, campaign_id, payment_method, gift_type, reference,
                       external_source, external_id, fee_amount, net_amount, fee_covered_amount, source_platform, recurring_plan_id, notes)
    select ${orgId}, ${constituentId}, ${cents(p.amountCents)}, (to_timestamp(${p.paidAt}) at time zone o.timezone)::date,
           ${fund.length ? p.fundId : null}, ${campaign.length ? p.campaignId : null}, 'card', ${p.recurringPlanId ? "recurring" : "one_time"}::gift_type,
           ${p.externalId}, 'stripe', ${p.externalId}, ${cents(p.feeCents)}, ${cents(p.netCents)},
           ${p.feeCoveredCents > 0 ? cents(p.feeCoveredCents) : null}, ${p.platform}, ${p.recurringPlanId ?? null}, ${p.note ?? null}
      from organizations o where o.id = ${orgId}
    returning id`);
  return { giftId: (r[0] as { id: string }).id, constituentId, created: true, matched };
}

/** One recurring plan per subscription. Safe to call from either the checkout or the first invoice. */
export async function ensureRecurringPlan(
  tx: Tx,
  orgId: string,
  s: { subscriptionId: string; amountCents: number; startedAt: number; donor: OnlineDonor; fundId: string | null; campaignId: string | null },
): Promise<{ planId: string; constituentId: string }> {
  await lock(tx, `plan:${orgId}:${s.subscriptionId}`);
  const existing = await tx.execute(sql`select id, constituent_id from recurring_plans where org_id = ${orgId} and external_source = 'stripe' and external_id = ${s.subscriptionId} limit 1`);
  if (existing.length) {
    const e = existing[0] as { id: string; constituent_id: string };
    return { planId: e.id, constituentId: e.constituent_id };
  }
  const { constituentId } = await matchOrCreateDonor(tx, orgId, s.donor);
  const fund = s.fundId ? await tx.execute(sql`select id from funds where id = ${s.fundId} and org_id = ${orgId} and active`) : [];
  const campaign = s.campaignId ? await tx.execute(sql`select id from campaigns where id = ${s.campaignId} and org_id = ${orgId}`) : [];
  const r = await tx.execute(sql`
    insert into recurring_plans (org_id, constituent_id, amount, frequency, starts_on, status, fund_id, campaign_id, external_source, external_id)
    select ${orgId}, ${constituentId}, ${cents(s.amountCents)}, 'monthly', (to_timestamp(${s.startedAt}) at time zone o.timezone)::date, 'active',
           ${fund.length ? s.fundId : null}, ${campaign.length ? s.campaignId : null}, 'stripe', ${s.subscriptionId}
      from organizations o where o.id = ${orgId}
    returning id`);
  return { planId: (r[0] as { id: string }).id, constituentId };
}

export async function endRecurringPlan(tx: Tx, orgId: string, subscriptionId: string): Promise<boolean> {
  const r = await tx.execute(sql`
    update recurring_plans set status = 'ended', ends_on = current_date
     where org_id = ${orgId} and external_source = 'stripe' and external_id = ${subscriptionId} and status <> 'ended'`);
  return r.count > 0;
}

/**
 * A payout is one bank deposit. It becomes one open batch whose expected total is the
 * gross of the gifts in it, so posting checks the gifts add up. The deposit itself is the
 * net; the fee is noted so the treasurer can match the bank line.
 */
export async function recordPayoutBatch(
  tx: Tx,
  orgId: string,
  p: { payoutId: string; arrivalDate: number; netCents: number; charges: { chargeId: string; amount: number; fee: number }[] },
): Promise<{ batchId: string; attached: number; missing: string[]; created: boolean }> {
  await lock(tx, `payout:${orgId}:${p.payoutId}`);
  const gross = p.charges.reduce((s, c) => s + c.amount, 0);
  const fees = p.charges.reduce((s, c) => s + c.fee, 0);
  const existing = await tx.execute(sql`select id from batches where org_id = ${orgId} and external_source = 'stripe' and external_id = ${p.payoutId}`);
  let batchId: string;
  let created = false;
  if (existing.length) batchId = (existing[0] as { id: string }).id;
  else {
    const r = await tx.execute(sql`
      insert into batches (org_id, batch_date, description, status, external_source, external_id, expected_total, expected_count, notes)
      select ${orgId}, (to_timestamp(${p.arrivalDate}) at time zone o.timezone)::date, ${"Stripe deposit"}, 'open', 'stripe', ${p.payoutId},
             ${cents(gross)}, ${p.charges.length}, ${`Deposit to the bank: $${cents(p.netCents)}. Stripe fees: $${cents(fees)}. Gifts: $${cents(gross)}.`}
        from organizations o where o.id = ${orgId}
      returning id`);
    batchId = (r[0] as { id: string }).id;
    created = true;
  }
  const ids = p.charges.map((c) => c.chargeId);
  const upd = ids.length
    ? await tx.execute(sql`
        update gifts set batch_id = ${batchId}
         where org_id = ${orgId} and external_source = 'stripe' and external_id = any(${textArray(ids)})
           and posted_at is null and (batch_id is null or batch_id = ${batchId})
        returning external_id`)
    : [];
  const found = new Set(upd.map((r) => (r as { external_id: string }).external_id));
  return { batchId, attached: found.size, missing: ids.filter((i) => !found.has(i)), created };
}

// ---- webhook bookkeeping

export async function recordWebhookEvent(
  tx: Tx,
  orgId: string,
  e: { provider: "stripe" | "mailchimp"; eventId: string; type: string; payload: unknown },
): Promise<{ id: string; alreadyProcessed: boolean }> {
  const r = await tx.execute(sql`
    insert into webhook_events (org_id, provider, event_id, type, payload)
    values (${orgId}, ${e.provider}::integration_provider, ${e.eventId}, ${e.type}, ${JSON.stringify(e.payload)}::jsonb)
    on conflict (provider, event_id) do update set received_at = webhook_events.received_at
    returning id, processed_at`);
  const row = r[0] as { id: string; processed_at: string | null };
  return { id: row.id, alreadyProcessed: row.processed_at != null };
}

export async function finishWebhookEvent(tx: Tx, id: string, result: { outcome: string; error?: string | null; needsAttention?: boolean }) {
  await tx.execute(sql`
    update webhook_events set processed_at = now(), outcome = ${result.outcome}, error = ${result.error ?? null}, needs_attention = ${result.needsAttention ?? false}
     where id = ${id}`);
}

/** Refunds are not undone automatically. A person decides whether to delete or adjust the gift. */
export async function flagRefund(tx: Tx, orgId: string, chargeId: string): Promise<{ giftId: string | null }> {
  const r = await tx.execute(sql`select id from gifts where org_id = ${orgId} and external_source = 'stripe' and external_id = ${chargeId} limit 1`);
  return { giftId: r.length ? (r[0] as { id: string }).id : null };
}

/** Records the error and leaves the event unprocessed, so the platform's retry runs it again. */
export async function failWebhookEvent(tx: Tx, id: string, error: string) {
  await tx.execute(sql`update webhook_events set processed_at = null, outcome = 'error', error = ${error}, needs_attention = true where id = ${id}`);
}
