import { z } from "zod";
import { giftInput, type GiftInput } from "./schemas/gift";

/**
 * The organization's own gift entry standards: which optional fields are required,
 * the default fund, whether gifts go through batches, and the instruction shown under
 * each field. The brief calls this the SOP that lives in the software.
 */
export const OPTIONAL_GIFT_FIELDS = ["campaignId", "appealId", "checkNumber", "reference", "notes"] as const;
export type OptionalGiftField = (typeof OPTIONAL_GIFT_FIELDS)[number];

export const GIFT_FIELDS = ["constituentId", "amount", "giftDate", "fundId", "paymentMethod", "giftType", ...OPTIONAL_GIFT_FIELDS] as const;
export type GiftField = (typeof GIFT_FIELDS)[number];

export const GIFT_FIELD_LABEL: Record<GiftField, string> = {
  constituentId: "Donor",
  amount: "Amount",
  giftDate: "Gift date",
  fundId: "Fund",
  paymentMethod: "Payment method",
  giftType: "Gift type",
  campaignId: "Campaign",
  appealId: "Appeal",
  checkNumber: "Check number",
  reference: "Reference",
  notes: "Notes",
};

export const giftEntryStandards = z.object({
  /** Fields that must be filled beyond the always-required ones (donor, amount, date, fund). */
  requiredFields: z.array(z.enum(OPTIONAL_GIFT_FIELDS)).default([]),
  /** Check number is required whenever the payment method is check. On by default. */
  checkNumberForChecks: z.boolean().default(true),
  defaultFundId: z.string().uuid().nullish(),
  /** When false, gifts are posted as they are entered. Batches are the default. */
  useBatches: z.boolean().default(true),
  /** One or two sentences shown under a field, written by the admin. */
  fieldInstructions: z.partialRecord(z.enum(GIFT_FIELDS), z.string().trim().max(300)).default({}),
  /** Free text printed on the standards page, e.g. how to name campaigns. */
  conventions: z.string().trim().max(5000).default(""),
});
export type GiftEntryStandards = z.infer<typeof giftEntryStandards>;

export const DEFAULT_STANDARDS: GiftEntryStandards = giftEntryStandards.parse({});

export type GiftIssue = { path: GiftField | string; message: string };

/**
 * Applies the org's standards to a gift. Returns the cleaned gift and any issues.
 * Issues block saving; the form shows them next to the field with the org's own
 * instruction text when there is one.
 */
export function validateGift(standards: GiftEntryStandards, raw: unknown): { gift: GiftInput | null; issues: GiftIssue[] } {
  const parsed = giftInput.safeParse(raw);
  if (!parsed.success) {
    return { gift: null, issues: uniqueByPath(parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))) };
  }
  const gift = { ...parsed.data };
  const issues: GiftIssue[] = [];

  if (!gift.fundId) {
    if (standards.defaultFundId) gift.fundId = standards.defaultFundId;
    else issues.push({ path: "fundId", message: "Choose a fund" });
  }
  for (const field of standards.requiredFields) {
    const v = gift[field];
    if (v === null || v === undefined || v === "") issues.push({ path: field, message: `${GIFT_FIELD_LABEL[field]} is required here` });
  }
  if (standards.checkNumberForChecks && gift.paymentMethod === "check" && !gift.checkNumber && !standards.requiredFields.includes("checkNumber")) {
    issues.push({ path: "checkNumber", message: "Enter the check number" });
  }
  if (gift.giftType === "in_kind") {
    if (!gift.fairMarketValue) issues.push({ path: "fairMarketValue", message: "Enter the fair market value of an in-kind gift" });
    if (gift.paymentMethod !== "in_kind") gift.paymentMethod = "in_kind";
  }
  if (gift.deductibleAmount == null) {
    const fmv = Number(gift.fairMarketValue ?? 0);
    gift.deductibleAmount = Math.max(0, Number(gift.amount) - fmv).toFixed(2);
  } else if (Number(gift.deductibleAmount) > Number(gift.amount)) {
    issues.push({ path: "deductibleAmount", message: "The deductible amount cannot be more than the gift" });
  }
  const unique = uniqueByPath(issues);
  return { gift: unique.length ? null : gift, issues: unique };
}

/** One issue per field, the first wins. */
function uniqueByPath(issues: GiftIssue[]): GiftIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.path) ? false : (seen.add(i.path), true)));
}

/** Which fields the form should mark required, for the org's standards. */
export function requiredGiftFields(standards: GiftEntryStandards): Set<GiftField> {
  const s = new Set<GiftField>(["constituentId", "amount", "giftDate", "fundId", "paymentMethod", "giftType"]);
  for (const f of standards.requiredFields) s.add(f);
  return s;
}
