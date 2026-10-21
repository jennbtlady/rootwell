import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { schedulerClaims, withRls } from "@maple/db";
import { deleteLapsedOrg, lapseNoticeEmail, lapseNoticeRecipients, lapsedOrgsDue, noticeDue, recordLapseNotice, touchOrgActivity } from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { getMailer } from "../email/mailer";

/** Vercel Cron sends "Authorization: Bearer $CRON_SECRET". Nothing runs without it. */
function authorized(header: string | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Daily, from Vercel Cron (apps/web/vercel.json). Lapsed accounts: send the 60, 30 and
 * 7 day notices to the whole team, and delete accounts whose time is up. Every rule is
 * checked again inside the database functions; this only drives them.
 */
export const cronRoutes = new Hono<ApiEnv>().get("/lapsed-accounts", async (c) => {
  if (!authorized(c.req.header("authorization"))) return c.json({ error: "Not allowed" }, 401);
  const db = getDb();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(c.req.url).origin;
  const due = await withRls(db, schedulerClaims(), (tx) => lapsedOrgsDue(tx));
  const mailer = getMailer();
  const summary = { checked: due.length, notices: 0, emails: 0, deleted: 0, failed: 0 };

  for (const o of due) {
    try {
      if (o.daysLeft <= 0) {
        if (await withRls(db, schedulerClaims(), (tx) => deleteLapsedOrg(tx, o.orgId))) {
          summary.deleted++;
          continue;
        }
      }
      // A late run still sends one notice, and deletion still waits 7 days after it.
      const days = noticeDue(o) ?? (o.daysLeft <= 0 && !o.noticesSent.includes(7) ? 7 : null);
      if (days == null) continue;
      const people = await withRls(db, schedulerClaims(), (tx) => lapseNoticeRecipients(tx, o.orgId));
      const base = `${origin}/app/orgs/${o.orgId}/settings`;
      // If this notice is late, deletion waits 7 days from today (the database enforces it).
      const lateBy = o.daysLeft < 7 && days === 7;
      const deleteOn = lateBy ? new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10) : o.deleteOn;
      const mail = lapseNoticeEmail({ orgName: o.name, deleteOn, daysLeft: lateBy ? 7 : o.daysLeft, accountUrl: `${base}/account`, billingUrl: `${base}/billing` });
      for (const p of people) {
        await mailer.send({ to: p.email, subject: mail.subject, text: mail.text });
        summary.emails++;
      }
      await withRls(db, schedulerClaims(), (tx) => recordLapseNotice(tx, o.orgId, days));
      summary.notices++;
    } catch {
      // Keep going for the other organizations. No donor details in logs.
      summary.failed++;
      console.error("lapsed-accounts: one organization failed", { orgId: o.orgId });
    }
  }
  return c.json(summary);
});

/**
 * Counts a team member's use of an organization as activity, which keeps a read-only
 * account from being deleted. Writes at most once an hour, only while read only.
 */
export const trackActivity = createMiddleware<ApiEnv>(async (c, next) => {
  await next();
  const m = /^\/api\/v1\/orgs\/([0-9a-f-]{36})(\/|$)/.exec(c.req.path);
  if (!m || c.res.status >= 400) return;
  await withRls(getDb(), c.get("claims"), (tx) => touchOrgActivity(tx, m[1]!)).catch(() => undefined);
});
