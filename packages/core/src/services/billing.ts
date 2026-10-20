import { sql } from "drizzle-orm";
import type { Tx } from "./types";

/**
 * Billing state for one organization. Stripe is the source of truth; these columns mirror
 * it through the billing webhook, which runs as the system actor.
 */
export type Billing = {
  status: string;
  trialEndsAt: string | null;
  /** Whole days left in the trial, rounded up. Null when not on a trial. */
  trialDaysLeft: number | null;
  readOnlyUntil: string | null;
  writable: boolean;
  isSample: boolean;
  hasSubscription: boolean;
  stripeCustomerId: string | null;
};

export async function getBilling(tx: Tx, orgId: string): Promise<Billing | null> {
  const r = await tx.execute(sql`
    select subscription_status, trial_ends_at, read_only_until, sample_org_enabled, stripe_customer_id, stripe_subscription_id, app.org_writable(id) as writable,
           case when trial_ends_at is not null then ceil(extract(epoch from trial_ends_at - now()) / 86400)::int end as trial_days_left
      from organizations where id = ${orgId}`);
  if (!r.length) return null;
  const x = r[0] as Record<string, unknown>;
  return {
    status: String(x.subscription_status),
    trialEndsAt: x.trial_ends_at ? new Date(x.trial_ends_at as string).toISOString() : null,
    trialDaysLeft: x.trial_days_left == null ? null : Number(x.trial_days_left),
    readOnlyUntil: x.read_only_until ? new Date(x.read_only_until as string).toISOString() : null,
    writable: Boolean(x.writable),
    isSample: Boolean(x.sample_org_enabled),
    hasSubscription: x.stripe_subscription_id != null,
    stripeCustomerId: (x.stripe_customer_id as string | null) ?? null,
  };
}

export async function orgWritable(tx: Tx, orgId: string): Promise<boolean> {
  const r = await tx.execute(sql`select app.org_writable(${orgId}) as w`);
  return Boolean((r[0] as { w: boolean }).w);
}

/** Only the owner, with two-step sign-in, starts or changes the subscription. */
export async function canManageBilling(tx: Tx, orgId: string): Promise<boolean> {
  const r = await tx.execute(sql`select app.has_role(${orgId}, '{owner}') and app.is_aal2() as ok`);
  return Boolean((r[0] as { ok: boolean }).ok);
}

/** Statuses that end access to changes. Stripe's own names. */
const LAPSED = new Set(["canceled", "unpaid", "incomplete_expired"]);
const READ_ONLY_DAYS = 90;

/**
 * Mirrors a Stripe subscription onto the organization. Runs as the system actor.
 * A lapse starts the 90-day read-only window once; coming back clears it.
 */
export async function applySubscription(
  tx: Tx,
  orgId: string,
  s: { customerId: string | null; subscriptionId: string; status: string; trialEnd: number | null },
): Promise<void> {
  const lapsed = LAPSED.has(s.status);
  await tx.execute(sql`
    update organizations set
      stripe_customer_id = coalesce(${s.customerId}, stripe_customer_id),
      stripe_subscription_id = ${s.subscriptionId},
      subscription_status = ${s.status},
      trial_ends_at = case when ${s.status} = 'trialing' and ${s.trialEnd}::bigint is not null then to_timestamp(${s.trialEnd}::bigint) else trial_ends_at end,
      read_only_until = case when ${lapsed} then coalesce(read_only_until, now() + make_interval(days => ${READ_ONLY_DAYS})) else null end
     where id = ${orgId}`);
}
