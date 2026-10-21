import { z } from "zod";
import { isoDate, money, optionalText, shortText } from "./common";

export const CODING_KINDS = ["funds", "campaigns", "appeals"] as const;
export type CodingKind = (typeof CODING_KINDS)[number];

const base = z.object({
  name: shortText(120).min(1, "Give it a name"),
  code: optionalText(30),
  description: optionalText(500),
  active: z.boolean().default(true),
  startsOn: isoDate.nullish(),
  endsOn: isoDate.nullish(),
});

/** incomeAccount: the QuickBooks income account gifts to this fund are credited to. */
export const fundInput = base.extend({ incomeAccount: optionalText(100) });
export const campaignInput = base.extend({ goalAmount: money.nullish() });
export const appealInput = base.extend({ campaignId: z.string().uuid().nullish() });

export const codingInputFor = { funds: fundInput, campaigns: campaignInput, appeals: appealInput } as const;
export type FundInput = z.infer<typeof fundInput>;
export type CampaignInput = z.infer<typeof campaignInput>;
export type AppealInput = z.infer<typeof appealInput>;

/** Choices made before an import runs. Each coding value maps to an existing id or "new". */
const codingChoices = z.record(z.string().max(200), z.union([z.string().uuid(), z.literal("new")]));
export const importOptions = z.object({
  thankedBefore: z.iso.date().nullable().default(null),
  coding: z.object({ fund: codingChoices.default({}), campaign: codingChoices.default({}), appeal: codingChoices.default({}) }).prefault({}),
});
export type ImportOptions = z.infer<typeof importOptions>;
