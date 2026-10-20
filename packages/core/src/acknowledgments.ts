/**
 * Merge fields, substantiation language, and default templates for thank-you letters,
 * emails and year-end statements. The IRS wording follows Publication 1771; have an
 * accountant review your templates before the first tax season.
 */

export const MERGE_FIELDS = [
  { key: "salutation", label: "Greeting name (goes by, first name, or organization)" },
  { key: "donor_name", label: "Donor's full name" },
  { key: "first_name", label: "First name" },
  { key: "gift_amount", label: "Gift amount" },
  { key: "gift_date", label: "Gift date" },
  { key: "fund", label: "Fund" },
  { key: "campaign", label: "Campaign" },
  { key: "deductible_amount", label: "Deductible amount" },
  { key: "substantiation", label: "IRS statement (goods or services)" },
  { key: "org_name", label: "Organization name" },
  { key: "org_ein", label: "Organization EIN" },
  { key: "org_address", label: "Organization address" },
  { key: "today", label: "Today's date" },
] as const;

export type MergeKey = (typeof MERGE_FIELDS)[number]["key"];
export type MergeContext = Record<MergeKey, string>;

export type GiftForAck = {
  amount: string;
  deductibleAmount: string | null;
  giftType: string;
  giftDate: string;
  notes: string | null;
};

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

/**
 * The written acknowledgment the IRS requires for gifts of $250 or more, included on
 * every gift so the rule never has to be remembered:
 * - cash gift with nothing in return: say so;
 * - quid pro quo (deductible below the amount): state the good-faith value of what was received;
 * - gift of property: describe it and do not value it.
 */
export function substantiation(g: GiftForAck, orgName: string): string {
  if (g.giftType === "in_kind") {
    const what = g.notes?.trim() ? `described as: ${g.notes.trim()}` : "as described in your records";
    return `${orgName} received your gift of property ${what}. No goods or services were provided in exchange for this contribution. The value of a gift of property is for you to determine.`;
  }
  const amount = Number(g.amount);
  const deductible = g.deductibleAmount == null ? amount : Number(g.deductibleAmount);
  const received = Math.round((amount - deductible) * 100) / 100;
  if (received > 0) {
    return `In exchange for your contribution of ${money(amount)}, you received goods or services with an estimated fair market value of ${money(received)}. The amount of your contribution that may be tax deductible is ${money(deductible)}.`;
  }
  return "No goods or services were provided in exchange for this contribution.";
}

/** Replaces {{field}} with values. Unknown fields stay visible so a typo is noticed. */
export function renderTemplate(text: string, ctx: Partial<MergeContext>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key: string) => (key in ctx ? (ctx[key as MergeKey] ?? "") : whole));
}

export function unknownMergeFields(text: string): string[] {
  const known = new Set<string>(MERGE_FIELDS.map((f) => f.key));
  return [...new Set([...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]!).filter((k) => !known.has(k)))];
}

export const DEFAULT_LETTER = {
  name: "Thank-you letter",
  channel: "letter" as const,
  subject: null,
  body: `Dear {{salutation}},

Thank you for your gift of {{gift_amount}} on {{gift_date}} to {{fund}}. Gifts like yours keep our work going, and we are grateful you chose to be part of it.

{{substantiation}}

{{org_name}} is a tax-exempt organization under section 501(c)(3) of the Internal Revenue Code. Our EIN is {{org_ein}}. Please keep this letter for your tax records.`,
  signature: "With thanks,\n\n\n\nExecutive Director",
};

export const DEFAULT_EMAIL = {
  name: "Thank-you email",
  channel: "email" as const,
  subject: "Thank you for your gift to {{org_name}}",
  body: `Dear {{salutation}},

Thank you for your gift of {{gift_amount}} on {{gift_date}} to {{fund}}. It makes a real difference, and we are grateful.

{{substantiation}}

{{org_name}} is a tax-exempt organization under section 501(c)(3) of the Internal Revenue Code (EIN {{org_ein}}). Please keep this email for your tax records.`,
  signature: "With thanks,\n{{org_name}}",
};

/** Statement wording, used on year-end giving statements. */
export function statementIntro(year: number, orgName: string): string {
  return `Thank you for your support of ${orgName} in ${year}. This statement lists the gifts we received from you during the year. Unless a gift shows goods or services received, no goods or services were provided in exchange for your contributions.`;
}
