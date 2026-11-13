import { sql } from "drizzle-orm";
import type { BatchInput, GiftInput } from "../schemas/gift";
import { giftEntryStandards, type GiftEntryStandards } from "../gift-standards";
import type { Tx } from "./types";

export type Gift = {
  id: string;
  constituentId: string;
  constituentName: string;
  batchId: string | null;
  amount: string;
  giftDate: string;
  fundId: string | null;
  fundName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  appealId: string | null;
  appealName: string | null;
  paymentMethod: string;
  giftType: string;
  checkNumber: string | null;
  reference: string | null;
  externalSource: string;
  fairMarketValue: string | null;
  deductibleAmount: string | null;
  acknowledgedAt: string | null;
  acknowledgmentMethod: string | null;
  notes: string | null;
  postedAt: string | null;
  createdAt: string;
  createdBy: string | null;
};

const giftSelect = sql`
  g.id, g.constituent_id, c.display_name as constituent_name, g.batch_id, g.amount::text, g.gift_date, g.fund_id, f.name as fund_name,
  g.campaign_id, ca.name as campaign_name, g.appeal_id, ap.name as appeal_name, g.payment_method, g.gift_type, g.check_number, g.reference,
  g.external_source, g.fair_market_value::text, g.deductible_amount::text, g.acknowledged_at, g.acknowledgment_method, g.notes, g.posted_at, g.created_at, g.created_by
`;
const giftFrom = sql`
  from gifts g
  join constituents c on c.id = g.constituent_id
  left join funds f on f.id = g.fund_id
  left join campaigns ca on ca.id = g.campaign_id
  left join appeals ap on ap.id = g.appeal_id
`;

function mapGift(r: Record<string, unknown>): Gift {
  const s = (k: string) => (r[k] == null ? null : String(r[k]));
  return {
    id: r.id as string,
    constituentId: r.constituent_id as string,
    constituentName: r.constituent_name as string,
    batchId: s("batch_id"),
    amount: String(r.amount),
    giftDate: String(r.gift_date),
    fundId: s("fund_id"),
    fundName: s("fund_name"),
    campaignId: s("campaign_id"),
    campaignName: s("campaign_name"),
    appealId: s("appeal_id"),
    appealName: s("appeal_name"),
    paymentMethod: r.payment_method as string,
    giftType: r.gift_type as string,
    checkNumber: s("check_number"),
    reference: s("reference"),
    externalSource: r.external_source as string,
    fairMarketValue: s("fair_market_value"),
    deductibleAmount: s("deductible_amount"),
    acknowledgedAt: s("acknowledged_at"),
    acknowledgmentMethod: s("acknowledgment_method"),
    notes: s("notes"),
    postedAt: s("posted_at"),
    createdAt: String(r.created_at),
    createdBy: s("created_by"),
  };
}

/** Null when the org is not visible to the caller (RLS), which the API turns into 404. */
export async function getStandards(tx: Tx, orgId: string): Promise<GiftEntryStandards | null> {
  const r = await tx.execute(sql`select gift_entry_standards from organizations where id = ${orgId}`);
  const row = r[0] as { gift_entry_standards?: unknown } | undefined;
  if (!row) return null;
  const parsed = giftEntryStandards.safeParse(row.gift_entry_standards ?? {});
  return parsed.success ? parsed.data : giftEntryStandards.parse({});
}

export async function setStandards(tx: Tx, orgId: string, standards: GiftEntryStandards): Promise<boolean> {
  const r = await tx.execute(sql`update organizations set gift_entry_standards = ${JSON.stringify(standards)}::jsonb where id = ${orgId}`);
  return r.count > 0;
}

export async function listGiftsForConstituent(tx: Tx, orgId: string, constituentId: string, limit = 100): Promise<Gift[]> {
  const rows = await tx.execute(sql`select ${giftSelect} ${giftFrom} where g.org_id = ${orgId} and g.constituent_id = ${constituentId} order by g.gift_date desc, g.created_at desc limit ${limit}`);
  return rows.map((r) => mapGift(r as Record<string, unknown>));
}

export const GIFT_FILTERS = ["missing_fund", "unacknowledged"] as const;
export type GiftFilter = (typeof GIFT_FILTERS)[number];

export async function listGifts(tx: Tx, orgId: string, opts: { filter?: GiftFilter; limit?: number; offset?: number } = {}): Promise<{ items: Gift[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const where =
    opts.filter === "missing_fund"
      ? sql`and g.fund_id is null`
      : opts.filter === "unacknowledged"
        ? sql`and g.posted_at is not null and g.acknowledged_at is null and g.gift_type <> 'soft_credit' and g.gift_date < current_date - 14`
        : sql``;
  const rows = await tx.execute(sql`select ${giftSelect}, count(*) over() as total ${giftFrom} where g.org_id = ${orgId} ${where} order by g.gift_date desc, g.created_at desc limit ${limit} offset ${offset}`);
  return { items: rows.map((r) => mapGift(r as Record<string, unknown>)), total: Number((rows[0] as { total?: number } | undefined)?.total ?? 0) };
}

export async function getGift(tx: Tx, orgId: string, id: string): Promise<Gift | null> {
  const rows = await tx.execute(sql`select ${giftSelect} ${giftFrom} where g.org_id = ${orgId} and g.id = ${id}`);
  return rows[0] ? mapGift(rows[0] as Record<string, unknown>) : null;
}

/** Inserts a gift that validateGift() has already cleaned against the org's standards. */
export async function createGift(tx: Tx, orgId: string, g: GiftInput): Promise<{ id: string }> {
  const r = await tx.execute(sql`
    insert into gifts (org_id, constituent_id, batch_id, amount, gift_date, fund_id, campaign_id, appeal_id, payment_method, gift_type, check_number, reference,
                       fair_market_value, deductible_amount, notes, pledge_id, recurring_plan_id)
    values (${orgId}, ${g.constituentId}, ${g.batchId ?? null}, ${g.amount}, ${g.giftDate}, ${g.fundId ?? null}, ${g.campaignId ?? null}, ${g.appealId ?? null},
            ${g.paymentMethod}::payment_method, ${g.giftType}::gift_type, ${g.checkNumber ?? null}, ${g.reference ?? null}, ${g.fairMarketValue ?? null}, ${g.deductibleAmount ?? null},
            ${g.notes ?? null}, ${g.pledgeId ?? null}, ${g.recurringPlanId ?? null})
    returning id`);
  return { id: (r[0] as { id: string }).id };
}

export async function updateGift(tx: Tx, orgId: string, id: string, g: GiftInput): Promise<boolean> {
  const r = await tx.execute(sql`
    update gifts set constituent_id = ${g.constituentId}, batch_id = ${g.batchId ?? null}, amount = ${g.amount}, gift_date = ${g.giftDate}, fund_id = ${g.fundId ?? null},
           campaign_id = ${g.campaignId ?? null}, appeal_id = ${g.appealId ?? null}, payment_method = ${g.paymentMethod}::payment_method, gift_type = ${g.giftType}::gift_type,
           check_number = ${g.checkNumber ?? null}, reference = ${g.reference ?? null}, fair_market_value = ${g.fairMarketValue ?? null}, deductible_amount = ${g.deductibleAmount ?? null},
           notes = ${g.notes ?? null}, pledge_id = ${g.pledgeId ?? null}, recurring_plan_id = ${g.recurringPlanId ?? null}
     where id = ${id} and org_id = ${orgId} and gift_type <> 'refund'`);
  // Refund entries come from Stripe and are never edited here; see recordReversal.
  return r.count > 0;
}

export async function deleteGift(tx: Tx, orgId: string, id: string): Promise<boolean> {
  // A gift with a refund entry pointing at it stays, so the refund never points at nothing.
  const r = await tx.execute(sql`delete from gifts where id = ${id} and org_id = ${orgId} and not exists (select 1 from gifts x where x.org_id = ${orgId} and x.reverses_gift_id = ${id})`);
  return r.count > 0;
}

// ---- batches
export type Batch = {
  id: string;
  batchDate: string;
  description: string | null;
  status: "open" | "posted";
  expectedTotal: string | null;
  expectedCount: number | null;
  giftCount: number;
  giftTotal: string;
  postedAt: string | null;
  postedBy: string | null;
  notes: string | null;
  createdAt: string;
};

function mapBatch(r: Record<string, unknown>): Batch {
  return {
    id: r.id as string,
    batchDate: String(r.batch_date),
    description: (r.description as string | null) ?? null,
    status: r.status as Batch["status"],
    expectedTotal: r.expected_total == null ? null : String(r.expected_total),
    expectedCount: r.expected_count == null ? null : Number(r.expected_count),
    giftCount: Number(r.gift_count ?? 0),
    giftTotal: String(r.gift_total ?? "0.00"),
    postedAt: r.posted_at == null ? null : String(r.posted_at),
    postedBy: (r.posted_by as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

const batchSelect = sql`
  b.*, coalesce(g.n, 0)::int as gift_count, coalesce(g.total, 0)::text as gift_total
  from batches b
  left join lateral (select count(*) as n, sum(amount) as total from gifts where batch_id = b.id) g on true
`;

export async function listBatches(tx: Tx, orgId: string, opts: { status?: "open" | "posted"; limit?: number } = {}): Promise<Batch[]> {
  const rows = await tx.execute(sql`
    select ${batchSelect} where b.org_id = ${orgId} ${opts.status ? sql`and b.status = ${opts.status}::batch_status` : sql``}
    order by b.status desc, b.batch_date desc, b.created_at desc limit ${opts.limit ?? 100}`);
  return rows.map((r) => mapBatch(r as Record<string, unknown>));
}

export async function getBatch(tx: Tx, orgId: string, id: string): Promise<(Batch & { gifts: Gift[] }) | null> {
  const rows = await tx.execute(sql`select ${batchSelect} where b.org_id = ${orgId} and b.id = ${id}`);
  if (!rows[0]) return null;
  const gifts = await tx.execute(sql`select ${giftSelect} ${giftFrom} where g.batch_id = ${id} and g.org_id = ${orgId} order by g.created_at`);
  return { ...mapBatch(rows[0] as Record<string, unknown>), gifts: gifts.map((r) => mapGift(r as Record<string, unknown>)) };
}

export async function createBatch(tx: Tx, orgId: string, input: BatchInput): Promise<{ id: string }> {
  const r = await tx.execute(sql`
    insert into batches (org_id, batch_date, description, expected_total, expected_count, notes)
    values (${orgId}, ${input.batchDate}, ${input.description ?? null}, ${input.expectedTotal ?? null}, ${input.expectedCount ?? null}, ${input.notes ?? null}) returning id`);
  return { id: (r[0] as { id: string }).id };
}

export async function updateBatch(tx: Tx, orgId: string, id: string, input: BatchInput): Promise<boolean> {
  const r = await tx.execute(sql`
    update batches set batch_date = ${input.batchDate}, description = ${input.description ?? null}, expected_total = ${input.expectedTotal ?? null},
           expected_count = ${input.expectedCount ?? null}, notes = ${input.notes ?? null}
     where id = ${id} and org_id = ${orgId}`);
  return r.count > 0;
}

export async function deleteBatch(tx: Tx, orgId: string, id: string): Promise<boolean> {
  const r = await tx.execute(sql`delete from batches where id = ${id} and org_id = ${orgId} and status = 'open'`);
  return r.count > 0;
}

export async function postBatch(tx: Tx, id: string): Promise<{ postedCount: number; postedTotal: string }> {
  const r = await tx.execute(sql`select * from app.post_batch(${id})`);
  const x = r[0] as { posted_count: number; posted_total: string };
  // Posted gifts change the totals. Recompute the dashboard now, so Home, the board
  // dashboard and board links match the bank straight away, not after the nightly run.
  await tx.execute(sql`select app.refresh_dashboard(b.org_id) from batches b where b.id = ${id}`);
  return { postedCount: Number(x.posted_count), postedTotal: String(x.posted_total) };
}

// ---- audit
export type AuditEntry = { id: number; action: string; actorId: string | null; actorName: string | null; actorKind: string; tableName: string; rowId: string; before: unknown; after: unknown; createdAt: string };

export async function listAuditForRow(tx: Tx, orgId: string, tableName: string, rowId: string, limit = 50): Promise<AuditEntry[]> {
  const rows = await tx.execute(sql`
    select a.id, a.action, a.actor_id, coalesce(p.full_name, p.email) as actor_name, a.actor_kind, a.table_name, a.row_id, a.before, a.after, a.created_at
      from audit_log a left join profiles p on p.id = a.actor_id
     where a.org_id = ${orgId} and a.table_name = ${tableName} and a.row_id = ${rowId}
     order by a.id desc limit ${limit}`);
  return rows.map((r) => {
    const x = r as Record<string, unknown>;
    return { id: Number(x.id), action: x.action as string, actorId: (x.actor_id as string | null) ?? null, actorName: (x.actor_name as string | null) ?? null, actorKind: x.actor_kind as string, tableName: x.table_name as string, rowId: x.row_id as string, before: x.before, after: x.after, createdAt: String(x.created_at) };
  });
}
