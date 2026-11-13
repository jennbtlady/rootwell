import { z } from "zod";
import { substantiation } from "./acknowledgments";

/**
 * Automatic email receipts for online gifts (fundraising Phase 2).
 *
 * A receipt has what the IRS asks for (Publication 1771): the organization's name, a
 * statement of its tax-exempt status, the amount and date, and whether goods or services
 * were given in return. The organization edits the thank-you text and the tax statement.
 * Sending the receipt counts as the thank-you (Jenn, 2026-11-12).
 */
export type ReceiptSettings = {
  /** On unless the organization turns it off. */
  enabled?: boolean;
  taxStatement?: string;
  thankYou?: string;
  signature?: string;
  /** Where donors' replies go. Without it, replies go nowhere useful, so the form asks for it. */
  replyTo?: string;
};

export const receiptSettingsInput = z.object({
  enabled: z.boolean(),
  taxStatement: z.string().trim().max(1000, "Keep the tax statement under 1,000 characters").optional().or(z.literal("")),
  thankYou: z.string().trim().max(2000, "Keep the thank-you under 2,000 characters").optional().or(z.literal("")),
  signature: z.string().trim().max(200).optional().or(z.literal("")),
  replyTo: z.string().trim().toLowerCase().email("Type an email address like office@yourshelter.org").max(200).optional().or(z.literal("")),
});
export type ReceiptSettingsInput = z.infer<typeof receiptSettingsInput>;

export const DEFAULT_THANK_YOU = "Thank you for your gift. Your support makes our work possible.";

export function defaultTaxStatement(orgName: string, ein: string | null): string {
  return `${orgName} is a tax-exempt organization under Section 501(c)(3) of the Internal Revenue Code.${ein ? ` Our EIN is ${ein}.` : ""}`;
}

/** The settings as they apply, with defaults filled in. */
export function resolvedReceipts(s: ReceiptSettings | null | undefined, org: { name: string; ein: string | null }) {
  return {
    enabled: s?.enabled !== false,
    taxStatement: s?.taxStatement?.trim() || defaultTaxStatement(org.name, org.ein),
    thankYou: s?.thankYou?.trim() || DEFAULT_THANK_YOU,
    signature: s?.signature?.trim() || org.name,
    replyTo: s?.replyTo?.trim() || null,
  };
}

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export type ReceiptGift = {
  amountCents: number;
  /** Null means all of it. */
  deductibleCents: number | null;
  giftDate: string;
  designation: string | null;
  monthly: boolean;
  tribute: { kind: "honor" | "memory"; honoreeName: string } | null;
  /** A link for a monthly donor to change their card or stop. */
  manageUrl: string | null;
};

/** The receipt as plain text. The sender turns paragraphs into simple HTML. */
export function buildReceipt(org: { name: string; ein: string | null }, settings: ReceiptSettings | null | undefined, donorName: string | null, g: ReceiptGift): { subject: string; text: string } {
  const s = resolvedReceipts(settings, org);
  const amount = (g.amountCents / 100).toFixed(2);
  const deductible = g.deductibleCents == null ? null : (g.deductibleCents / 100).toFixed(2);
  const lines = [
    donorName ? `Dear ${donorName},` : "Hello,",
    s.thankYou,
    [
      `Receipt from ${org.name}`,
      `Amount: ${money(g.amountCents)}${g.monthly ? " (monthly gift)" : ""}`,
      `Date: ${longDate(g.giftDate)}`,
      g.designation ? `For: ${g.designation}` : null,
      g.tribute ? `${g.tribute.kind === "honor" ? "In honor of" : "In memory of"}: ${g.tribute.honoreeName}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    substantiation({ amount, deductibleAmount: deductible, giftType: "one_time", giftDate: g.giftDate, notes: null }, org.name),
    s.taxStatement,
    "Please keep this email for your tax records.",
    g.manageUrl ? `To change your card or stop your monthly gift, use this private link: ${g.manageUrl}` : null,
    s.signature,
  ].filter((l): l is string => Boolean(l));
  return { subject: `Thank you for your gift to ${org.name}`, text: lines.join("\n\n") };
}

/** The note to the person a donor asked us to tell about a tribute gift. No amount: that stays private. */
export function buildTributeNotice(orgName: string, donorName: string | null, t: { kind: "honor" | "memory"; honoreeName: string; notifyName: string | null }): { subject: string; text: string } {
  const who = donorName || "Someone";
  const what = t.kind === "honor" ? `in honor of ${t.honoreeName}` : `in memory of ${t.honoreeName}`;
  return {
    subject: `A gift ${what}`,
    text: [
      t.notifyName ? `Dear ${t.notifyName},` : "Hello,",
      `${who} made a gift to ${orgName} ${what}, and asked us to let you know.`,
      `With warm wishes from everyone at ${orgName}.`,
    ].join("\n\n"),
  };
}
