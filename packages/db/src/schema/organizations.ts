import { boolean, integer, jsonb, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
  /** Card order and visibility for each dashboard, one layout per organization: { staff: [{ id, shown }], board: [...] }. Empty means the default layout. */
  dashboardLayouts: jsonb("dashboard_layouts").notNull().default({}),
  // True only for the demo organization every account can add and remove.
  sampleOrgEnabled: boolean("sample_org_enabled").notNull().default(false),
  /** Account names for the QuickBooks export. */
  accounting: jsonb("accounting").$type<{ depositAccount?: string; feeAccount?: string; defaultIncomeAccount?: string }>().notNull().default({}),

  // Billing. Subscription state is mirrored from Stripe webhooks; Stripe is the source of truth.
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  subscriptionStatus: text("subscription_status").notNull().default("trialing"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  // When a subscription lapses the org becomes read only for 90 days. Exports stay available.
  readOnlyUntil: timestamp("read_only_until", { withTimezone: true }),
  // Lapsed accounts are deleted after 12 months with no activity, after notices to the whole
  // team (docs/lapsed-accounts.md). Activity is a team member signing in (from Supabase's own
  // records) or using the API; this column holds the API part. Changed by the system only.
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  /** Which deletion notices (60, 30, 7 days) went out for the current quiet stretch. */
  lapseNoticesSent: smallint("lapse_notices_sent").array().notNull().default([]),
  /** The quiet stretch those notices were for. New activity starts a new stretch. */
  lapseNoticesFor: timestamp("lapse_notices_for", { withTimezone: true }),
  /** When the last notice went out. Deletion waits at least 7 days after it. */
  lapseFinalNoticeAt: timestamp("lapse_final_notice_at", { withTimezone: true }),

  ...rowMeta,
});

/**
 * A note that an organization was deleted for inactivity, with no donor or personal data,
 * so we can answer "what happened to our account". Not tenant data: the organization is
 * gone. Written only by app.delete_lapsed_org(); nobody signed in can read it.
 */
export const deletedOrganizations = pgTable("deleted_organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  formerOrgId: uuid("former_org_id").notNull(),
  name: text("name").notNull(),
  orgCreatedAt: timestamp("org_created_at", { withTimezone: true }).notNull(),
  subscriptionStatus: text("subscription_status").notNull(),
  lapsedAt: timestamp("lapsed_at", { withTimezone: true }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  noticesSent: smallint("notices_sent").array().notNull(),
  membersNotified: integer("members_notified").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
});
