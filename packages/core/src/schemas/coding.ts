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

export const fundInput = base;
export const campaignInput = base.extend({ goalAmount: money.nullish() });
export const appealInput = base.extend({ campaignId: z.string().uuid().nullish() });

export const codingInputFor = { funds: fundInput, campaigns: campaignInput, appeals: appealInput } as const;
export type FundInput = z.infer<typeof fundInput>;
export type CampaignInput = z.infer<typeof campaignInput>;
export type AppealInput = z.infer<typeof appealInput>;
