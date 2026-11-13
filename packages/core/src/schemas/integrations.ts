import { z } from "zod";
import { isoDate, optionalText, shortText } from "./common";

export const INTEGRATION_PROVIDERS = ["stripe", "mailchimp"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const MAX_ONLINE_GIFT = 100_000;

export const donationPageInput = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/, "Use 3 to 50 lowercase letters, numbers, and dashes. Start and end with a letter or number."),
  title: shortText(120).min(1, "Give the page a title"),
  intro: optionalText(2000),
  thankYou: optionalText(2000),
  fundIds: z.array(z.string().uuid()).max(10).default([]),
  campaignId: z.string().uuid().nullish(),
  amounts: z
    .array(z.number().int().min(1).max(MAX_ONLINE_GIFT))
    .min(1, "Add at least one suggested amount")
    .max(6, "Use six suggested amounts or fewer")
    .default([25, 50, 100, 250]),
  allowMonthly: z.boolean().default(true),
  offerCoverFees: z.boolean().default(true),
  /** Fundraising Phase 2: in honor or memory of someone. */
  allowTribute: z.boolean().default(false),
  /** Fundraising Phase 2: an optional message from the donor. */
  allowMessage: z.boolean().default(false),
  /** Fundraising Phase 2: animals donors can sponsor on this page, in order. */
  animalIds: z.array(z.string().uuid()).max(30).default([]),
  active: z.boolean().default(true),
});
export type DonationPageInput = z.infer<typeof donationPageInput>;

/** What a donor submits on the public page. Amount in whole dollars or dollars and cents. */
export const checkoutRequest = z.object({
  amount: z.coerce
    .number()
    .min(1, "The smallest gift is $1")
    .max(MAX_ONLINE_GIFT, `The largest online gift is $${MAX_ONLINE_GIFT.toLocaleString("en-US")}`)
    .transform((v) => Math.round(v * 100) / 100),
  monthly: z.boolean().default(false),
  fundId: z.string().uuid().nullish(),
  coverFee: z.boolean().default(false),
  /** Fundraising Phase 2: the animal this gift sponsors, from the page's list. */
  animalId: z.string().uuid().nullish(),
  /** Fundraising Phase 2: in honor or memory of someone, and who to tell. */
  tribute: z
    .object({
      kind: z.enum(["honor", "memory"]),
      honoreeName: z.string().trim().min(1, "Type the name of the person or pet").max(120),
      notifyName: z.string().trim().max(120).nullish(),
      notifyEmail: z.string().trim().toLowerCase().email("Type an email address like name@example.org").max(200).nullish().or(z.literal("").transform(() => null)),
    })
    .nullish(),
  /** Fundraising Phase 2: a short note to the organization. Travels in Stripe's metadata, so 500 characters at most. */
  message: z.string().trim().max(500, "Keep the message under 500 characters").nullish(),
  /** The Turnstile bot check token from the giving form. Checked on the server. */
  botCheck: z.string().max(4096).optional(),
});
export type CheckoutRequest = z.infer<typeof checkoutRequest>;

/** One animal a donor can sponsor (fundraising Phase 2). */
export const sponsorAnimalInput = z.object({
  name: shortText(80).min(1, "Type the animal's name"),
  description: optionalText(500),
  /** In the public "branding" bucket, in the organization's own folder. */
  photoPath: z
    .string()
    .regex(/^[0-9a-f-]{36}\/[a-z0-9-]+\.(png|jpe?g|webp)$/, "Upload the photo again")
    .nullish(),
  fundId: z.string().uuid().nullish(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});
export type SponsorAnimalInput = z.infer<typeof sponsorAnimalInput>;

export const accountingSettings = z.object({
  depositAccount: optionalText(100),
  feeAccount: optionalText(100),
  defaultIncomeAccount: optionalText(100),
});
export type AccountingSettings = z.infer<typeof accountingSettings>;

export const mailchimpKeyInput = z.object({ apiKey: z.string().trim().min(10, "Paste the whole API key").max(100) });
export const mailchimpConfigInput = z.object({
  listId: z.string().trim().min(1).max(50),
  /** The org confirms these people agreed to get email. We never subscribe anyone without it. */
  permissionConfirmed: z.boolean(),
});

export const accountingExportQuery = z.object({ from: isoDate, to: isoDate });
