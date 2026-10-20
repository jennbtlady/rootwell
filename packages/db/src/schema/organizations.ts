import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { rowMeta, uuidPk } from "./_shared";

export type GiftEntryStandards = {
  requiredFields?: string[];
  defaultFundId?: string | null;
  useBatches?: boolean;
  fieldInstructions?: Record<string, string>;
};

export type OrgAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

/**
 * One row per nonprofit. For this table the tenant key is `id` itself.
 * Tenant tables elsewhere reference it through `org_id`.
 */
export const organizations = pgTable("organizations", {
  id: uuidPk(),
  name: text("name").notNull(),
  ein: text("ein"),
  address: jsonb("address").$type<OrgAddress>().notNull().default({}),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1),
  timezone: text("timezone").notNull().default("America/New_York"),
  logoPath: text("logo_path"),
  giftEntryStandards: jsonb("gift_entry_standards").$type<GiftEntryStandards>().notNull().default({}),
  hideBoardNames: boolean("hide_board_names").notNull().default(true),
  sampleOrgEnabled: boolean("sample_org_enabled").notNull().default(true),

  // Billing. Subscription state is mirrored from Stripe webhooks; Stripe is the source of truth.
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  subscriptionStatus: text("subscription_status").notNull().default("trialing"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  // When a subscription lapses the org becomes read only for 90 days. Exports stay available.
  readOnlyUntil: timestamp("read_only_until", { withTimezone: true }),

  ...rowMeta,
});
