import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { integrationProvider, integrationStatus, rowMeta, uuidPk } from "./_shared";
import { campaigns } from "./coding";
import { organizations } from "./organizations";

export const integrations = pgTable(
  "integrations",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: integrationProvider("provider").notNull(),
    status: integrationStatus("status").notNull().default("connected"),
    /** Stripe connected account id, or the Mailchimp data center. Not secret. */
    accountId: text("account_id"),
    /** AES-256-GCM ciphertext of the provider credentials. Never returned by the API. */
    credentials: text("credentials"),
    config: jsonb("config").notNull().default({}),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncSummary: jsonb("last_sync_summary"),
    lastError: text("last_error"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    ...rowMeta,
  },
  (t) => [uniqueIndex("integrations_org_provider_uq").on(t.orgId, t.provider), index("integrations_account_idx").on(t.provider, t.accountId)],
);

/** Every webhook received, once. Errors stay visible on Data Health. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuidPk(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    provider: integrationProvider("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().default(sql`now()`),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    outcome: text("outcome"),
    error: text("error"),
    needsAttention: boolean("needs_attention").notNull().default(false),
  },
  (t) => [uniqueIndex("webhook_events_provider_event_uq").on(t.provider, t.eventId), index("webhook_events_org_idx").on(t.orgId, t.receivedAt)],
);

export const donationPages = pgTable(
  "donation_pages",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Public address: /give/{slug}. Unique across all organizations. */
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    intro: text("intro"),
    thankYou: text("thank_you"),
    fundIds: uuid("fund_ids").array().notNull().default(sql`'{}'::uuid[]`),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    /** Suggested amounts in whole dollars. */
    amounts: integer("amounts").array().notNull().default(sql`'{25,50,100,250}'::int[]`),
    allowMonthly: boolean("allow_monthly").notNull().default(true),
    offerCoverFees: boolean("offer_cover_fees").notNull().default(true),
    active: boolean("active").notNull().default(true),
    ...rowMeta,
  },
  (t) => [uniqueIndex("donation_pages_slug_uq").on(t.slug), index("donation_pages_org_idx").on(t.orgId)],
);
