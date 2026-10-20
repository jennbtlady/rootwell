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
};
export type DashboardSnapshot = { computedAt: string; data: DashboardData };

/** The latest snapshot, computing today's if there is none yet. */
export async function getDashboard(tx: Tx, orgId: string): Promise<DashboardSnapshot | null> {
  const rows = await tx.execute(sql`select computed_at, data, as_of from dashboard_snapshots where org_id = ${orgId} order by as_of desc limit 1`);
  const r = rows[0] as { computed_at: string; data: DashboardData; as_of: string } | undefined;
  const today = new Date().toISOString().slice(0, 10);
  if (r && String(r.as_of).slice(0, 10) === today) return { computedAt: String(r.computed_at), data: r.data };
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
