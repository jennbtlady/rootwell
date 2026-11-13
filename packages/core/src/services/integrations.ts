import { sql } from "drizzle-orm";
import type { Tx } from "./types";
import type { AccountingSettings, DonationPageInput, IntegrationProvider } from "../schemas/integrations";
import { DEFAULT_ACCOUNTS, type AccountNames, type ExportBatch } from "../accounting";
import { uuidArray } from "./online";
import type { OrgBranding } from "../branding";

export type Integration = {
  provider: IntegrationProvider;
  /** needs_info: Stripe connected, but the account cannot take payments yet. */
  status: "connected" | "error" | "disconnected" | "needs_info";
  accountId: string | null;
  config: Record<string, unknown>;
  lastSyncAt: string | null;
  lastSyncSummary: Record<string, unknown> | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

const mapIntegration = (r: Record<string, unknown>): Integration => ({
  provider: r.provider as IntegrationProvider,
  status: r.status as Integration["status"],
  accountId: (r.account_id as string | null) ?? null,
  config: (r.config as Record<string, unknown>) ?? {},
  lastSyncAt: r.last_sync_at ? String(r.last_sync_at) : null,
  lastSyncSummary: (r.last_sync_summary as Record<string, unknown> | null) ?? null,
  lastError: (r.last_error as string | null) ?? null,
  lastErrorAt: r.last_error_at ? String(r.last_error_at) : null,
});

const cols = sql`provider, status, account_id, config, last_sync_at, last_sync_summary, last_error, last_error_at`;

export async function listIntegrations(tx: Tx, orgId: string): Promise<Integration[]> {
  const r = await tx.execute(sql`select ${cols} from integrations where org_id = ${orgId} order by provider`);
  return r.map((x) => mapIntegration(x as Record<string, unknown>));
}

export async function getIntegration(tx: Tx, orgId: string, provider: IntegrationProvider): Promise<Integration | null> {
  const r = await tx.execute(sql`select ${cols} from integrations where org_id = ${orgId} and provider = ${provider}::integration_provider`);
  return r.length ? mapIntegration(r[0] as Record<string, unknown>) : null;
}

/** Connects (or reconnects) a provider. `credentials` is already encrypted by the caller. */
export async function saveIntegration(
  tx: Tx,
  orgId: string,
  provider: IntegrationProvider,
  v: { accountId: string | null; credentials: string | null; config?: Record<string, unknown> },
): Promise<void> {
  // Update first, then insert. An upsert would have to read the credentials column through
  // `excluded`, and signed-in roles are not allowed to read it.
  const u = await tx.execute(sql`
    update integrations set status = 'connected', account_id = ${v.accountId}, credentials = ${v.credentials},
           ${v.config ? sql`config = ${JSON.stringify(v.config)}::jsonb,` : sql``} last_error = null, last_error_at = null
     where org_id = ${orgId} and provider = ${provider}::integration_provider`);
  if (u.count > 0) return;
  await tx.execute(sql`
    insert into integrations (org_id, provider, status, account_id, credentials, config)
    values (${orgId}, ${provider}::integration_provider, 'connected', ${v.accountId}, ${v.credentials}, ${JSON.stringify(v.config ?? {})}::jsonb)`);
}

export async function updateIntegrationConfig(tx: Tx, orgId: string, provider: IntegrationProvider, patch: Record<string, unknown>): Promise<boolean> {
  const r = await tx.execute(sql`
    update integrations set config = config || ${JSON.stringify(patch)}::jsonb
     where org_id = ${orgId} and provider = ${provider}::integration_provider and status <> 'disconnected'`);
  return r.count > 0;
}

/**
 * Records whether a connected Stripe account can take payments (fundraising Phase 1). Only
 * moves between connected and needs_info; a disconnected integration stays disconnected.
 */
export async function setStripeReady(tx: Tx, orgId: string, ready: boolean): Promise<boolean> {
  const r = await tx.execute(sql`
    update integrations set status = ${ready ? "connected" : "needs_info"}::integration_status
     where org_id = ${orgId} and provider = 'stripe' and status in ('connected', 'needs_info')`);
  return r.count > 0;
}

export async function disconnectIntegration(tx: Tx, orgId: string, provider: IntegrationProvider): Promise<boolean> {
  const r = await tx.execute(sql`
    update integrations set status = 'disconnected', credentials = null
     where org_id = ${orgId} and provider = ${provider}::integration_provider and status <> 'disconnected'`);
  return r.count > 0;
}

/** Encrypted credentials, for the server only. Owners, admins, and the system actor. */
export async function integrationCredentials(tx: Tx, orgId: string, provider: IntegrationProvider): Promise<string | null> {
  const r = await tx.execute(sql`select app.integration_credentials(${orgId}, ${provider}::integration_provider) as c`);
  return (r[0] as { c: string | null }).c;
}

export async function recordIntegrationRun(tx: Tx, orgId: string, provider: IntegrationProvider, result: { summary?: Record<string, unknown>; error?: string | null }) {
  if (result.error) {
    await tx.execute(sql`
      update integrations set status = 'error', last_error = ${result.error}, last_error_at = now()
       where org_id = ${orgId} and provider = ${provider}::integration_provider`);
  } else {
    await tx.execute(sql`
      update integrations set status = 'connected', last_sync_at = now(), last_sync_summary = ${JSON.stringify(result.summary ?? {})}::jsonb, last_error = null, last_error_at = null
       where org_id = ${orgId} and provider = ${provider}::integration_provider`);
  }
}

// ---- donation pages

export type DonationPage = DonationPageInput & { id: string; createdAt: string };

const mapPage = (r: Record<string, unknown>): DonationPage => ({
  id: r.id as string,
  slug: r.slug as string,
  title: r.title as string,
  intro: (r.intro as string | null) ?? null,
  thankYou: (r.thank_you as string | null) ?? null,
  fundIds: (r.fund_ids as string[] | null) ?? [],
  campaignId: (r.campaign_id as string | null) ?? null,
  amounts: ((r.amounts as number[] | null) ?? []).map(Number),
  allowMonthly: Boolean(r.allow_monthly),
  offerCoverFees: Boolean(r.offer_cover_fees),
  active: Boolean(r.active),
  createdAt: String(r.created_at),
});

const intArray = (xs: number[]) => sql`array[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::int[]`;

export async function listDonationPages(tx: Tx, orgId: string): Promise<DonationPage[]> {
  const r = await tx.execute(sql`select * from donation_pages where org_id = ${orgId} order by created_at`);
  return r.map((x) => mapPage(x as Record<string, unknown>));
}

export async function getDonationPage(tx: Tx, orgId: string, id: string): Promise<DonationPage | null> {
  const r = await tx.execute(sql`select * from donation_pages where org_id = ${orgId} and id = ${id}`);
  return r.length ? mapPage(r[0] as Record<string, unknown>) : null;
}

export class SlugTakenError extends Error {
  constructor() {
    super("That web address is already in use. Try another.");
  }
}

async function slugGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") throw new SlugTakenError();
    throw e;
  }
}

export async function createDonationPage(tx: Tx, orgId: string, p: DonationPageInput): Promise<{ id: string }> {
  return slugGuard(async () => {
    await tx.execute(sql`savepoint dp`);
    try {
      const r = await tx.execute(sql`
        insert into donation_pages (org_id, slug, title, intro, thank_you, fund_ids, campaign_id, amounts, allow_monthly, offer_cover_fees, active)
        values (${orgId}, ${p.slug}, ${p.title}, ${p.intro}, ${p.thankYou}, ${uuidArray(p.fundIds)}, ${p.campaignId ?? null}, ${intArray(p.amounts)},
                ${p.allowMonthly}, ${p.offerCoverFees}, ${p.active})
        returning id`);
      await tx.execute(sql`release savepoint dp`);
      return { id: (r[0] as { id: string }).id };
    } catch (e) {
      await tx.execute(sql`rollback to savepoint dp`);
      throw e;
    }
  });
}

export async function updateDonationPage(tx: Tx, orgId: string, id: string, p: DonationPageInput): Promise<boolean> {
  return slugGuard(async () => {
    await tx.execute(sql`savepoint dp`);
    try {
      const r = await tx.execute(sql`
        update donation_pages set slug = ${p.slug}, title = ${p.title}, intro = ${p.intro}, thank_you = ${p.thankYou}, fund_ids = ${uuidArray(p.fundIds)},
               campaign_id = ${p.campaignId ?? null}, amounts = ${intArray(p.amounts)}, allow_monthly = ${p.allowMonthly}, offer_cover_fees = ${p.offerCoverFees}, active = ${p.active}
         where org_id = ${orgId} and id = ${id}`);
      await tx.execute(sql`release savepoint dp`);
      return r.count > 0;
    } catch (e) {
      await tx.execute(sql`rollback to savepoint dp`);
      throw e;
    }
  });
}

export async function deleteDonationPage(tx: Tx, orgId: string, id: string): Promise<boolean> {
  const r = await tx.execute(sql`delete from donation_pages where org_id = ${orgId} and id = ${id}`);
  return r.count > 0;
}

export type PublicDonationPage = {
  id: string;
  orgId: string;
  orgName: string;
  title: string;
  intro: string | null;
  thankYou: string | null;
  amounts: number[];
  allowMonthly: boolean;
  offerCoverFees: boolean;
  campaignId: string | null;
  funds: { id: string; name: string }[];
  stripeAccount: string | null;
  sample: boolean;
  /** The organization's brand for this public page (fundraising Phase 1). */
  branding: OrgBranding;
  logoPath: string | null;
};

/** Runs as the anonymous role. Null when the page is off or the organization lacks Donations. */
export async function publicDonationPage(tx: Tx, slug: string): Promise<PublicDonationPage | null> {
  const r = await tx.execute(sql`select app.public_donation_page(${slug}) as p`);
  return ((r[0] as { p: PublicDonationPage | null } | undefined)?.p ?? null) as PublicDonationPage | null;
}

/** Runs as the anonymous role, after the webhook signature is checked. */
export async function orgForIntegrationAccount(tx: Tx, provider: IntegrationProvider, accountId: string): Promise<string | null> {
  const r = await tx.execute(sql`select app.org_for_integration_account(${provider}::integration_provider, ${accountId}) as o`);
  return (r[0] as { o: string | null }).o;
}

// ---- accounting

/** Null when the caller cannot see the organization. */
export async function getAccountingSettings(tx: Tx, orgId: string): Promise<AccountingSettings | null> {
  const r = await tx.execute(sql`select accounting from organizations where id = ${orgId}`);
  if (!r.length) return null;
  const a = ((r[0] as { accounting?: AccountingSettings }).accounting ?? {}) as Partial<AccountingSettings>;
  return { depositAccount: a.depositAccount ?? null, feeAccount: a.feeAccount ?? null, defaultIncomeAccount: a.defaultIncomeAccount ?? null };
}

export async function setAccountingSettings(tx: Tx, orgId: string, s: AccountingSettings): Promise<boolean> {
  const r = await tx.execute(sql`update organizations set accounting = ${JSON.stringify(s)}::jsonb where id = ${orgId}`);
  return r.count > 0;
}

export function accountNames(s: AccountingSettings): AccountNames {
  return {
    depositAccount: s.depositAccount || DEFAULT_ACCOUNTS.depositAccount,
    feeAccount: s.feeAccount || DEFAULT_ACCOUNTS.feeAccount,
    defaultIncomeAccount: s.defaultIncomeAccount || DEFAULT_ACCOUNTS.defaultIncomeAccount,
  };
}

/** Posted batches in a date range, with the gifts that moved money. Optionally one batch. */
export async function exportBatches(tx: Tx, orgId: string, opts: { from?: string; to?: string; batchId?: string }): Promise<ExportBatch[]> {
  const rows = await tx.execute(sql`
    select b.id as batch_id, b.batch_date, b.description, g.amount::text as amount, g.fee_amount::text as fee, f.name as fund_name, f.income_account
      from batches b
      join gifts g on g.batch_id = b.id and g.gift_type not in ('in_kind', 'soft_credit', 'pledge')
      left join funds f on f.id = g.fund_id
     where b.org_id = ${orgId} and b.status = 'posted'
       ${opts.batchId ? sql`and b.id = ${opts.batchId}` : sql``}
       ${opts.from ? sql`and b.batch_date >= ${opts.from}` : sql``}
       ${opts.to ? sql`and b.batch_date <= ${opts.to}` : sql``}
     order by b.batch_date, b.created_at, b.id, g.created_at`);
  const out = new Map<string, ExportBatch>();
  for (const r of rows as Record<string, unknown>[]) {
    const id = r.batch_id as string;
    let b = out.get(id);
    if (!b) out.set(id, (b = { batchId: id, batchDate: String(r.batch_date), description: (r.description as string | null) ?? null, gifts: [] }));
    b.gifts.push({ amount: String(r.amount), fee: (r.fee as string | null) ?? null, fundName: (r.fund_name as string | null) ?? null, incomeAccount: (r.income_account as string | null) ?? null });
  }
  return [...out.values()];
}

// ---- Mailchimp

export type MailchimpContact = { email: string; firstName: string; lastName: string; unsubscribe: boolean; tags: string[] };

/**
 * Everyone with an email address. People marked do not email, do not contact, or deceased
 * are sent as unsubscribes so Mailchimp never mails them. Tags: the org's own tags plus
 * "Donor" (any gift) and "Monthly donor" (an active recurring plan).
 */
export async function mailchimpContacts(tx: Tx, orgId: string): Promise<MailchimpContact[]> {
  const rows = await tx.execute(sql`
    select e.email, coalesce(c.preferred_name, c.first_name, '') as first_name, coalesce(c.last_name, c.org_name, '') as last_name,
           (c.do_not_email or c.do_not_contact or c.deceased) as unsubscribe,
           array_remove(array[
             case when exists (select 1 from gifts g where g.constituent_id = c.id and g.gift_type <> 'soft_credit') then 'Donor' end,
             case when exists (select 1 from recurring_plans r where r.constituent_id = c.id and r.status = 'active') then 'Monthly donor' end
           ] || coalesce((select array_agg(t.name order by t.name) from constituent_tags ct join tags t on t.id = ct.tag_id where ct.constituent_id = c.id), '{}'), null) as tags
      from constituents c
      join lateral (select email from constituent_emails e where e.constituent_id = c.id order by e.is_primary desc, e.created_at limit 1) e on true
     where c.org_id = ${orgId}
     order by e.email`);
  const seen = new Set<string>();
  const out: MailchimpContact[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const email = String(r.email).toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ email, firstName: String(r.first_name), lastName: String(r.last_name), unsubscribe: Boolean(r.unsubscribe), tags: (r.tags as string[]) ?? [] });
  }
  return out;
}

/** Tags we manage in Mailchimp. Anything else a person added there is left alone. */
export async function managedTagNames(tx: Tx, orgId: string): Promise<string[]> {
  const r = await tx.execute(sql`select name from tags where org_id = ${orgId} order by name`);
  return ["Donor", "Monthly donor", ...r.map((x) => String((x as { name: string }).name))];
}

// ---- health

export type IntegrationHealth = {
  integrations: { provider: IntegrationProvider; status: string; lastError: string | null; lastErrorAt: string | null; lastSyncAt: string | null }[];
  needsAttention: { id: string; provider: string; type: string; receivedAt: string; outcome: string | null; error: string | null }[];
  failedLast30Days: number;
  stuck: number;
};

export async function integrationHealth(tx: Tx, orgId: string): Promise<IntegrationHealth> {
  const integrations = (await listIntegrations(tx, orgId)).map((i) => ({ provider: i.provider, status: i.status, lastError: i.lastError, lastErrorAt: i.lastErrorAt, lastSyncAt: i.lastSyncAt }));
  const attn = await tx.execute(sql`
    select id, provider, type, received_at, outcome, error from webhook_events
     where org_id = ${orgId} and (needs_attention or error is not null) and received_at > now() - interval '90 days'
     order by received_at desc limit 50`);
  const counts = await tx.execute(sql`
    select count(*) filter (where error is not null and received_at > now() - interval '30 days')::int as failed,
           count(*) filter (where processed_at is null and received_at < now() - interval '10 minutes')::int as stuck
      from webhook_events where org_id = ${orgId}`);
  const c = counts[0] as { failed: number; stuck: number };
  return {
    integrations,
    needsAttention: (attn as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      provider: r.provider as string,
      type: r.type as string,
      receivedAt: String(r.received_at),
      outcome: (r.outcome as string | null) ?? null,
      error: (r.error as string | null) ?? null,
    })),
    failedLast30Days: c.failed,
    stuck: c.stuck,
  };
}

export async function resolveWebhookAttention(tx: Tx, orgId: string, id: string): Promise<boolean> {
  const r = await tx.execute(sql`select app.resolve_webhook_event(${id}) as ok from webhook_events where id = ${id} and org_id = ${orgId}`);
  return Boolean((r[0] as { ok?: boolean } | undefined)?.ok);
}

/** Owners and admins, with two-step sign-in, manage integrations. */
export async function canManageIntegrations(tx: Tx, orgId: string): Promise<boolean> {
  const r = await tx.execute(sql`select app.has_role(${orgId}, '{owner,admin}') and app.is_aal2() as ok`);
  return Boolean((r[0] as { ok: boolean }).ok);
}
