import { systemClaims, withRls } from "@maple/db";
import { buildReceipt, buildTributeNotice, resolvedReceipts } from "@maple/core";
import { markTributeNotified, receiptJob, recordReceipt } from "@maple/core/services";
import { getDb } from "../db";
import { signManageLink } from "../integrations/crypto";
import { getMailer, textToHtml } from "./mailer";

const appOrigin = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Sends the automatic receipt for one new online gift, and the tribute notice if the donor
 * asked for one (fundraising Phase 2). Runs after the gift is saved. Never throws: a failed
 * email is recorded, and the gift stays on the thank-you list for a person to handle.
 * Logs and errors carry no donor details.
 */
export async function sendGiftEmails(orgId: string, giftId: string): Promise<{ receipt: "sent" | "failed" | "off" | "skipped"; tribute: "sent" | "failed" | "none" }> {
  const db = getDb();
  const claims = systemClaims(orgId);
  const job = await withRls(db, claims, (tx) => receiptJob(tx, orgId, giftId));
  if (!job) return { receipt: "skipped", tribute: "none" };
  const s = resolvedReceipts(job.settings, job.org);
  const mailer = getMailer();
  const replyTo = s.replyTo ?? undefined;

  let receipt: "sent" | "failed" | "off" | "skipped" = "off";
  if (s.enabled) {
    if (!job.donorEmail || job.doNotEmail) {
      // No address, or the donor asked for no email: a person sends a letter instead.
      await withRls(db, claims, (tx) => recordReceipt(tx, orgId, giftId, { status: "failed", recipient: null, error: job.donorEmail ? "The donor asked for no email." : "No email address for this donor." }));
      receipt = "skipped";
    } else {
      const manageUrl = job.gift.monthly && job.subscriptionId ? `${appOrigin()}/manage/${signManageLink({ orgId, subscriptionId: job.subscriptionId })}` : null;
      const r = buildReceipt(job.org, job.settings, job.donorName, { ...job.gift, manageUrl });
      try {
        await mailer.send({ to: job.donorEmail, subject: r.subject, text: r.text, html: textToHtml(r.text), fromName: job.org.name, replyTo });
        await withRls(db, claims, (tx) => recordReceipt(tx, orgId, giftId, { status: "sent", recipient: job.donorEmail, error: null }));
        receipt = "sent";
      } catch (e) {
        const error = e instanceof Error ? e.message.slice(0, 200) : "Could not send";
        await withRls(db, claims, (tx) => recordReceipt(tx, orgId, giftId, { status: "failed", recipient: job.donorEmail, error }));
        receipt = "failed";
      }
    }
  }

  let tribute: "sent" | "failed" | "none" = "none";
  const t = job.tribute;
  if (t?.notifyEmail && !t.notifiedAt) {
    const n = buildTributeNotice(job.org.name, job.donorName, t);
    try {
      await mailer.send({ to: t.notifyEmail, subject: n.subject, text: n.text, html: textToHtml(n.text), fromName: job.org.name, replyTo });
      await withRls(db, claims, (tx) => markTributeNotified(tx, orgId, giftId));
      tribute = "sent";
    } catch {
      tribute = "failed";
    }
  }
  return { receipt, tribute };
}
