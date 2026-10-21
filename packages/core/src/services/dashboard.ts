import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "./types";

type Money = number | string;
export type DashboardData = {
  asOf: string;
  fiscalYearStart: string;
  priorPeriod: { start: string; end: string };
  retentionPeriod: { earlierStart: string; laterStart: string; laterEnd: string };
  donorsYtd: number;
  donorsPriorYtd: number;
  dollarsYtd: Money;
  dollarsPriorYtd: Money;
  giftsYtd: number;
  averageGiftYtd: Money;
  medianGiftYtd: Money;
  newDonorsYtd: number;
  repeatDonorsYtd: number;
  retention: Record<"overall" | "firstTime" | "repeat", { base: number; retained: number }>;
  byFund: { name: string; total: Money; gifts: number }[];
  byCampaign: { name: string; total: Money; gifts: number }[];
  byMonth: { label: string; current: Money; prior: Money; month_index: number }[];
  topGifts: { giftId?: string; constituentId?: string; name: string; amount: Money; date: string; fund: string | null }[];
  lapsed: { count: number; from: string; to: string };
  /** Active campaigns with a goal, and what has come in inside the campaign's dates. Added in Phase 6; older snapshots lack it. */
  campaignGoals?: { name: string; goal: Money; raised: Money; starts_on: string | null; ends_on: string | null }[];
  /** Gave last fiscal year, not yet this one. Added in Phase 6. */
  lybunt?: number;
};
export type DashboardSnapshot = { computedAt: string; data: DashboardData };

/** The latest snapshot, computing today's if there is none yet. */
export async function getDashboard(tx: Tx, orgId: string): Promise<DashboardSnapshot | null> {
  const rows = await tx.execute(sql`select computed_at, data, as_of from dashboard_snapshots where org_id = ${orgId} order by as_of desc limit 1`);
  const r = rows[0] as { computed_at: string; data: DashboardData; as_of: string } | undefined;
  const today = new Date().toISOString().slice(0, 10);
  // Recalculate when today's figures were made before a newer field existed (Phase 6 added
  // campaignGoals and lybunt), so nobody sees a misleading zero for one day.
  if (r && String(r.as_of).slice(0, 10) === today && "lybunt" in r.data && "campaignGoals" in r.data) return { computedAt: String(r.computed_at), data: r.data };
  return refreshDashboard(tx, orgId);
}

export async function refreshDashboard(tx: Tx, orgId: string): Promise<DashboardSnapshot | null> {
  const r = await tx.execute(sql`select app.refresh_dashboard(${orgId}) as d, now() as at`);
  const x = r[0] as { d: DashboardData | null; at: string };
  return x.d ? { computedAt: String(x.at), data: x.d } : null;
}

/** Hides names for board viewers when the organization asks for it. */
export function redactForBoard(data: DashboardData, hideNames: boolean): DashboardData {
  return { ...data, topGifts: data.topGifts.map((g) => ({ name: hideNames ? "A donor" : g.name, amount: g.amount, date: g.date, fund: g.fund })) };
}

// ---- board share links
export type ShareLink = { id: string; label: string; createdAt: string; lastViewedAt: string | null; revokedAt: string | null };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function listShareLinks(tx: Tx, orgId: string): Promise<ShareLink[]> {
  const rows = await tx.execute(sql`select id, label, created_at, last_viewed_at, revoked_at from board_share_links where org_id = ${orgId} order by created_at desc`);
  return rows.map((r) => {
    const x = r as Record<string, unknown>;
    return { id: x.id as string, label: x.label as string, createdAt: String(x.created_at), lastViewedAt: x.last_viewed_at == null ? null : String(x.last_viewed_at), revokedAt: x.revoked_at == null ? null : String(x.revoked_at) };
  });
}

/** Returns the plain token once. Only its hash is stored. */
export async function createShareLink(tx: Tx, orgId: string, label: string): Promise<{ id: string; token: string }> {
  const token = randomBytes(24).toString("base64url");
  const r = await tx.execute(sql`insert into board_share_links (org_id, token_hash, label) values (${orgId}, ${hashToken(token)}, ${label}) returning id`);
  return { id: (r[0] as { id: string }).id, token };
}

export async function revokeShareLink(tx: Tx, orgId: string, id: string): Promise<boolean> {
  const r = await tx.execute(sql`update board_share_links set revoked_at = now() where id = ${id} and org_id = ${orgId} and revoked_at is null`);
  return r.count > 0;
}

export type BoardView = { orgName: string; computedAt: string; hideNames: boolean; data: DashboardData };

export async function boardView(tx: Tx, token: string): Promise<BoardView | null> {
  const r = await tx.execute(sql`select app.board_view(${hashToken(token)}) as v`);
  return ((r[0] as { v: BoardView | null }).v ?? null);
}

export async function setHideBoardNames(tx: Tx, orgId: string, hide: boolean): Promise<boolean> {
  const r = await tx.execute(sql`update organizations set hide_board_names = ${hide} where id = ${orgId}`);
  return r.count > 0;
}

// ---- the staff view (Home): live, for signed-in staff only

export type StaffHome = {
  todos: {
    toThank: number;
    toThankNeedLetter: number;
    openBatches: number;
    onlineAwaitingDeposit: number;
    possibleDuplicates: number;
    onlineNeedsAttention: number;
  };
  /** Gave the most last fiscal year and nothing yet this year. */
  topNotYet: { constituentId: string; name: string; lastYear: string; lastGiftOn: string }[];
  recentGifts: { giftId: string; constituentId: string; name: string; amount: string; date: string; fund: string | null; online: boolean; posted: boolean }[];
};

/**
 * What staff need to act on, worked out live. "Need a letter" follows the IRS rule: a single
 * gift of $250 or more needs a written acknowledgment.
 */
export async function staffHome(tx: Tx, orgId: string): Promise<StaffHome | null> {
  const t = await tx.execute(sql`
    select
      (select count(*) from gifts where org_id = ${orgId} and posted_at is not null and acknowledged_at is null and gift_type <> 'soft_credit')::int as to_thank,
      (select count(*) from gifts where org_id = ${orgId} and posted_at is not null and acknowledged_at is null and gift_type <> 'soft_credit' and amount >= 250)::int as need_letter,
      (select count(*) from batches where org_id = ${orgId} and status = 'open')::int as open_batches,
      (select count(*) from gifts where org_id = ${orgId} and external_source = 'stripe' and batch_id is null and posted_at is null)::int as online_waiting,
      (select count(*) from duplicate_candidates where org_id = ${orgId} and status = 'open')::int as dups,
      (select count(*) from webhook_events where org_id = ${orgId} and needs_attention)::int as attention,
      app.fiscal_year_start(current_date, o.fiscal_year_start_month) as fy
    from organizations o where o.id = ${orgId}`);
  if (!t.length) return null;
  const x = t[0] as Record<string, unknown>;
  const fy = String(x.fy).slice(0, 10);
  const top = await tx.execute(sql`
    select c.id, c.display_name, sum(g.amount)::text as last_year, max(g.gift_date)::text as last_gift
      from gifts g join constituents c on c.id = g.constituent_id
     where g.org_id = ${orgId} and g.posted_at is not null and g.gift_type not in ('soft_credit', 'pledge')
       and g.gift_date >= (${fy}::date - interval '1 year') and g.gift_date < ${fy}::date
       and not exists (select 1 from gifts n where n.constituent_id = c.id and n.gift_date >= ${fy}::date and n.gift_type <> 'soft_credit')
       and not c.deceased
     group by c.id, c.display_name
     order by sum(g.amount) desc
     limit 5`);
  const recent = await tx.execute(sql`
    select g.id, g.constituent_id, c.display_name, g.amount::text, g.gift_date::text, f.name as fund, g.external_source = 'stripe' as online, g.posted_at is not null as posted
      from gifts g join constituents c on c.id = g.constituent_id left join funds f on f.id = g.fund_id
     where g.org_id = ${orgId} and g.gift_type <> 'soft_credit'
     order by g.gift_date desc, g.created_at desc limit 6`);
  return {
    todos: {
      toThank: Number(x.to_thank),
      toThankNeedLetter: Number(x.need_letter),
      openBatches: Number(x.open_batches),
      onlineAwaitingDeposit: Number(x.online_waiting),
      possibleDuplicates: Number(x.dups),
      onlineNeedsAttention: Number(x.attention),
    },
    topNotYet: (top as Record<string, unknown>[]).map((r) => ({ constituentId: r.id as string, name: r.display_name as string, lastYear: String(r.last_year), lastGiftOn: String(r.last_gift) })),
    recentGifts: (recent as Record<string, unknown>[]).map((r) => ({
      giftId: r.id as string,
      constituentId: r.constituent_id as string,
      name: r.display_name as string,
      amount: String(r.amount),
      date: String(r.gift_date),
      fund: (r.fund as string | null) ?? null,
      online: Boolean(r.online),
      posted: Boolean(r.posted),
    })),
  };
}
