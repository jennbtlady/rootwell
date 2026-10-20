import { sql } from "drizzle-orm";
import type { Tx } from "./types";

export type DuplicatePair = {
  id: string;
  score: number;
  reasons: string[];
  status: "open" | "merged" | "not_duplicate";
  a: { id: string; displayName: string; primaryEmail: string | null; city: string | null; giftCount: number; lastGiftOn: string | null; createdAt: string };
  b: { id: string; displayName: string; primaryEmail: string | null; city: string | null; giftCount: number; lastGiftOn: string | null; createdAt: string };
};

const side = (p: string) => sql`json_build_object(
  'id', ${sql.identifier(p)}.id, 'displayName', ${sql.identifier(p)}.display_name,
  'primaryEmail', (select e.email from constituent_emails e where e.constituent_id = ${sql.identifier(p)}.id order by e.is_primary desc limit 1),
  'city', (select x.city from constituent_addresses x where x.constituent_id = ${sql.identifier(p)}.id order by x.is_primary desc limit 1),
  'giftCount', (select count(*) from gifts g where g.constituent_id = ${sql.identifier(p)}.id),
  'lastGiftOn', (select max(g.gift_date) from gifts g where g.constituent_id = ${sql.identifier(p)}.id),
  'createdAt', ${sql.identifier(p)}.created_at)`;

export async function listDuplicates(tx: Tx, orgId: string, status: DuplicatePair["status"] = "open", limit = 100): Promise<DuplicatePair[]> {
  const rows = await tx.execute(sql`
    select d.id, d.score, d.reasons, d.status, ${side("ca")} as a, ${side("cb")} as b
      from duplicate_candidates d
      join constituents ca on ca.id = d.a_id
      join constituents cb on cb.id = d.b_id
     where d.org_id = ${orgId} and d.status = ${status}::duplicate_status
     order by d.score desc, d.created_at
     limit ${limit}`);
  return rows.map((r) => {
    const x = r as Record<string, unknown>;
    return { id: x.id as string, score: Number(x.score), reasons: x.reasons as string[], status: x.status as DuplicatePair["status"], a: x.a as DuplicatePair["a"], b: x.b as DuplicatePair["b"] };
  });
}

export async function getDuplicate(tx: Tx, orgId: string, id: string): Promise<DuplicatePair | null> {
  const rows = await tx.execute(sql`
    select d.id, d.score, d.reasons, d.status, ${side("ca")} as a, ${side("cb")} as b
      from duplicate_candidates d join constituents ca on ca.id = d.a_id join constituents cb on cb.id = d.b_id
     where d.org_id = ${orgId} and d.id = ${id}`);
  const x = rows[0] as Record<string, unknown> | undefined;
  if (!x) return null;
  return { id: x.id as string, score: Number(x.score), reasons: x.reasons as string[], status: x.status as DuplicatePair["status"], a: x.a as DuplicatePair["a"], b: x.b as DuplicatePair["b"] };
}

/** Re-scores the whole organization. Returns the number of open pairs. */
export async function scanDuplicates(tx: Tx, orgId: string): Promise<number> {
  const r = await tx.execute(sql`select app.scan_duplicates(${orgId}) as n`);
  return Number((r[0] as { n: number }).n);
}

export async function markNotDuplicate(tx: Tx, orgId: string, id: string, userId: string): Promise<boolean> {
  const r = await tx.execute(sql`update duplicate_candidates set status = 'not_duplicate', resolved_at = now(), resolved_by = ${userId} where id = ${id} and org_id = ${orgId} and status = 'open'`);
  return r.count > 0;
}

export async function reopenDuplicate(tx: Tx, orgId: string, id: string): Promise<boolean> {
  const r = await tx.execute(sql`update duplicate_candidates set status = 'open', resolved_at = null, resolved_by = null where id = ${id} and org_id = ${orgId} and status = 'not_duplicate'`);
  return r.count > 0;
}

export type MergeDecisions = Record<string, "a" | "b">;

/** Merges `mergedId` into `survivorId`. Returns the merge history id for undo. */
export async function mergeConstituents(tx: Tx, survivorId: string, mergedId: string, decisions: MergeDecisions): Promise<{ mergeId: string }> {
  const r = await tx.execute(sql`select app.merge_constituents(${survivorId}, ${mergedId}, ${JSON.stringify(decisions)}::jsonb) as id`);
  return { mergeId: (r[0] as { id: string }).id };
}

export async function unmerge(tx: Tx, mergeId: string): Promise<void> {
  await tx.execute(sql`select app.unmerge(${mergeId})`);
}

export type MergeRecord = {
  id: string;
  survivingId: string;
  survivingName: string | null;
  mergedId: string;
  mergedDisplayName: string;
  decisions: MergeDecisions;
  reversibleUntil: string;
  reversedAt: string | null;
  createdAt: string;
  createdByName: string | null;
};

export async function listMerges(tx: Tx, orgId: string, limit = 50): Promise<MergeRecord[]> {
  const rows = await tx.execute(sql`
    select m.id, m.surviving_id, s.display_name as surviving_name, m.merged_id, m.merged_display_name, m.decisions, m.reversible_until, m.reversed_at, m.created_at,
           coalesce(p.full_name, p.email) as created_by_name
      from merge_history m
      left join constituents s on s.id = m.surviving_id
      left join profiles p on p.id = m.created_by
     where m.org_id = ${orgId}
     order by m.created_at desc limit ${limit}`);
  return rows.map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: x.id as string, survivingId: x.surviving_id as string, survivingName: (x.surviving_name as string | null) ?? null, mergedId: x.merged_id as string,
      mergedDisplayName: x.merged_display_name as string, decisions: (x.decisions as MergeDecisions) ?? {}, reversibleUntil: String(x.reversible_until),
      reversedAt: x.reversed_at == null ? null : String(x.reversed_at), createdAt: String(x.created_at), createdByName: (x.created_by_name as string | null) ?? null,
    };
  });
}

export type DataHealth = {
  openDuplicates: number;
  missingEmail: number;
  missingAddress: number;
  giftsMissingFund: number;
  unacknowledged14d: number;
  stale36m: number;
  constituents: number;
  recentMerges: number;
};

export async function dataHealth(tx: Tx, orgId: string): Promise<DataHealth> {
  const r = await tx.execute(sql`select app.data_health(${orgId}) as h`);
  const h = (r[0] as { h: Record<string, number> }).h;
  const n = (k: string) => Number(h[k] ?? 0);
  return { openDuplicates: n("openDuplicates"), missingEmail: n("missingEmail"), missingAddress: n("missingAddress"), giftsMissingFund: n("giftsMissingFund"), unacknowledged14d: n("unacknowledged14d"), stale36m: n("stale36m"), constituents: n("constituents"), recentMerges: n("recentMerges") };
}
