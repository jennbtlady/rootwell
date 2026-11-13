import { sql } from "drizzle-orm";
import type { ReceiptGift, ReceiptSettings, ReceiptSettingsInput } from "../receipts";
import type { Tx } from "./types";

/**
 * Automatic receipts (fundraising Phase 2). Settings live on the organization. Staff can
 * read them; owners and admins change them (RLS on organizations).
 */
export async function getReceiptSettings(tx: Tx, orgId: string): Promise<{ settings: ReceiptSettings; org: { name: string; ein: string | null } } | null> {
  const r = await tx.execute(sql`select name, ein, receipts from organizations where id = ${orgId}`);
  if (!r.length) return null;
  const x = r[0] as { name: string; ein: string | null; receipts: ReceiptSettings | null };
  return { settings: x.receipts ?? {}, org: { name: x.name, ein: x.ein } };
}

export async function saveReceiptSettings(tx: Tx, orgId: string, input: ReceiptSettingsInput): Promise<boolean> {
  const settings: ReceiptSettings = {
    enabled: input.enabled,
    ...(input.taxStatement ? { taxStatement: input.taxStatement } : {}),
    ...(input.thankYou ? { thankYou: input.thankYou } : {}),
    ...(input.signature ? { signature: input.signature } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  };
  const r = await tx.execute(sql`update organizations set receipts = ${JSON.stringify(settings)}::jsonb where id = ${orgId} and app.has_role(${orgId}, '{owner,admin}')`);
  return r.count > 0;
}

/** Everything a receipt for one online gift needs. Runs as the system actor from the webhook. */
export type ReceiptJob = {
  org: { name: string; ein: string | null };
  settings: ReceiptSettings;
  donorName: string | null;
  donorEmail: string | null;
  doNotEmail: boolean;
  gift: ReceiptGift;
  /** For a monthly gift: Stripe's subscription id, so the sender can sign a manage link. */
  subscriptionId: string | null;
  tribute: { kind: "honor" | "memory"; honoreeName: string; notifyName: string | null; notifyEmail: string | null; notifiedAt: string | null } | null;
};

export async function receiptJob(tx: Tx, orgId: string, giftId: string): Promise<ReceiptJob | null> {
  const r = await tx.execute(sql`
    select o.name as org_name, o.ein, o.receipts, c.display_name, c.first_name, (c.do_not_email or c.do_not_contact) as do_not_email,
           (select e.email from constituent_emails e where e.constituent_id = c.id order by e.is_primary desc, e.created_at limit 1) as email,
           g.amount::numeric as amount, g.deductible_amount::numeric as deductible, g.gift_date::text as gift_date, g.gift_type,
           coalesce(case when a.id is not null then 'Sponsoring ' || a.name end, f.name) as designation,
           p.external_id as subscription_id,
           t.kind as t_kind, t.honoree_name, t.notify_name, t.notify_email, t.notified_at
      from gifts g
      join organizations o on o.id = g.org_id
      join constituents c on c.id = g.constituent_id
      left join funds f on f.id = g.fund_id
      left join sponsor_animals a on a.id = g.sponsor_animal_id
      left join recurring_plans p on p.id = g.recurring_plan_id and p.external_source = 'stripe'
      left join gift_tributes t on t.gift_id = g.id
     where g.org_id = ${orgId} and g.id = ${giftId}`);
  if (!r.length) return null;
  const x = r[0] as Record<string, unknown>;
  const cents = (v: unknown) => Math.round(Number(v) * 100);
  return {
    org: { name: x.org_name as string, ein: (x.ein as string | null) ?? null },
    settings: (x.receipts as ReceiptSettings | null) ?? {},
    donorName: (x.display_name as string | null) ?? null,
    donorEmail: (x.email as string | null) ?? null,
    doNotEmail: Boolean(x.do_not_email),
    subscriptionId: (x.subscription_id as string | null) ?? null,
    gift: {
      amountCents: cents(x.amount),
      deductibleCents: x.deductible == null ? null : cents(x.deductible),
      giftDate: x.gift_date as string,
      designation: (x.designation as string | null) ?? null,
      monthly: x.gift_type === "recurring",
      tribute: x.t_kind ? { kind: x.t_kind as "honor" | "memory", honoreeName: x.honoree_name as string } : null,
      manageUrl: null,
    },
    tribute: x.t_kind
      ? { kind: x.t_kind as "honor" | "memory", honoreeName: x.honoree_name as string, notifyName: (x.notify_name as string | null) ?? null, notifyEmail: (x.notify_email as string | null) ?? null, notifiedAt: (x.notified_at as string | null) ?? null }
      : null,
  };
}

/**
 * Records the receipt. A sent receipt is the thank-you: the gift leaves the thank-you list
 * (Jenn, 2026-11-12). A failed one is logged and the gift stays on the list for a person.
 */
export async function recordReceipt(tx: Tx, orgId: string, giftId: string, r: { status: "sent" | "failed"; recipient: string | null; error: string | null }): Promise<void> {
  await tx.execute(sql`
    insert into acknowledgments (org_id, gift_id, channel, status, recipient, error)
    values (${orgId}, ${giftId}, 'email', ${r.status}::ack_status, ${r.recipient}, ${r.error})`);
  if (r.status === "sent") {
    await tx.execute(sql`update gifts set acknowledged_at = now(), acknowledgment_method = 'Email receipt' where org_id = ${orgId} and id = ${giftId} and acknowledged_at is null`);
  }
}

export async function markTributeNotified(tx: Tx, orgId: string, giftId: string): Promise<void> {
  await tx.execute(sql`update gift_tributes set notified_at = now() where org_id = ${orgId} and gift_id = ${giftId} and notified_at is null`);
}

/**
 * A monthly gift, found from the signed link in its receipt (fundraising Phase 2). Runs as
 * the system actor for the organization named in the link. Says only what the donor's own
 * page needs.
 */
export type ManagedGift = {
  orgName: string;
  amount: string;
  designation: string | null;
  status: "active" | "paused" | "ended";
  stripeAccount: string | null;
  branding: Record<string, string>;
  logoPath: string | null;
};

export async function monthlyGiftForManage(tx: Tx, orgId: string, subscriptionId: string): Promise<ManagedGift | null> {
  const r = await tx.execute(sql`
    select o.name as org_name, p.amount::text as amount, p.status, o.branding, o.logo_path,
           coalesce(case when a.id is not null then 'Sponsoring ' || a.name end, f.name) as designation,
           (select i.account_id from integrations i where i.org_id = o.id and i.provider = 'stripe' and i.status = 'connected') as account
      from recurring_plans p
      join organizations o on o.id = p.org_id
      left join funds f on f.id = p.fund_id
      left join sponsor_animals a on a.id = p.sponsor_animal_id
     where p.org_id = ${orgId} and p.external_source = 'stripe' and p.external_id = ${subscriptionId}`);
  if (!r.length) return null;
  const x = r[0] as Record<string, unknown>;
  return {
    orgName: x.org_name as string,
    amount: x.amount as string,
    designation: (x.designation as string | null) ?? null,
    status: x.status as ManagedGift["status"],
    stripeAccount: (x.account as string | null) ?? null,
    branding: (x.branding as Record<string, string> | null) ?? {},
    logoPath: (x.logo_path as string | null) ?? null,
  };
}

/** Owners and admins to warn about unusual activity. System actor for the organization only. */
export async function alertRecipients(tx: Tx, orgId: string): Promise<{ email: string; fullName: string | null }[]> {
  const r = await tx.execute(sql`select * from app.alert_recipients(${orgId})`);
  return (r as unknown as { email: string | null; full_name: string | null }[]).filter((x) => x.email).map((x) => ({ email: x.email!, fullName: x.full_name }));
}
