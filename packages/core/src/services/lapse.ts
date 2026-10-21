import { sql } from "drizzle-orm";
import type { Tx } from "./types";

/**
 * Lapsed accounts (docs/lapsed-accounts.md). The rules live in the database functions in
 * drizzle/custom/0011_lapsed_accounts.sql; these wrappers are for the daily job, which runs
 * with scheduler claims, and for recording activity, which runs as the signed-in person.
 */
export type LapsedOrg = { orgId: string; name: string; deleteOn: string; daysLeft: number; noticesSent: number[]; finalNoticeAt: string | null };

export const LAPSE_NOTICE_DAYS = [60, 30, 7] as const;

export async function lapsedOrgsDue(tx: Tx): Promise<LapsedOrg[]> {
  const r = await tx.execute(sql`select * from app.lapsed_orgs_due()`);
  return (r as Record<string, unknown>[]).map((x) => ({
    orgId: x.org_id as string,
    name: x.name as string,
    deleteOn: String(x.delete_on).slice(0, 10),
    daysLeft: Number(x.days_left),
    noticesSent: ((x.notices_sent as number[] | null) ?? []).map(Number),
    finalNoticeAt: x.final_notice_at ? String(x.final_notice_at) : null,
  }));
}

export async function lapseNoticeRecipients(tx: Tx, orgId: string): Promise<{ email: string; fullName: string | null }[]> {
  const r = await tx.execute(sql`select * from app.lapse_notice_recipients(${orgId})`);
  return (r as unknown as { email: string; full_name: string | null }[]).filter((x) => x.email).map((x) => ({ email: x.email, fullName: x.full_name }));
}

export async function recordLapseNotice(tx: Tx, orgId: string, days: number): Promise<void> {
  await tx.execute(sql`select app.record_lapse_notice(${orgId}, ${days}::smallint)`);
}

export async function deleteLapsedOrg(tx: Tx, orgId: string): Promise<boolean> {
  const r = await tx.execute(sql`select app.delete_lapsed_org(${orgId}) as ok`);
  return Boolean((r[0] as { ok: boolean }).ok);
}

/** A team member used this organization. Only counts (and only writes) while it is read only. */
export async function touchOrgActivity(tx: Tx, orgId: string): Promise<void> {
  await tx.execute(sql`select app.touch_org_activity(${orgId})`);
}

/** Which notice is due today, if any: the shortest lead time already reached and not yet sent. */
export function noticeDue(o: Pick<LapsedOrg, "daysLeft" | "noticesSent">): number | null {
  const due = LAPSE_NOTICE_DAYS.filter((d) => o.daysLeft <= d && !o.noticesSent.includes(d));
  return due.length ? Math.min(...due) : null;
}

export function lapseNoticeEmail(o: { orgName: string; deleteOn: string; daysLeft: number; accountUrl: string; billingUrl: string }) {
  const when = new Date(`${o.deleteOn}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const subject = `${o.orgName}: your donor records will be deleted on ${when}`;
  const text = `Hello,

${o.orgName}'s Rootwell account has been read only since its subscription ended, and no one on the team has signed in for a long time.

On ${when} (in ${Math.max(o.daysLeft, 0)} days), the account and all of its donor and gift records will be deleted for good.

To keep the records:
- Sign in. Any team member signing in resets the clock.
- Or download everything now. An owner or admin can do this under Settings, Account and export:
  ${o.accountUrl}
- Or restart the subscription (the owner, under Settings, Billing):
  ${o.billingUrl}

Nonprofits usually need gift records for several years for tax receipts. Please make sure someone downloads a copy before this date.

We are sending this to everyone on ${o.orgName}'s team.

Rootwell`;
  return { subject, text };
}
