import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { batchStatus, day, externalSource, giftType, money, paymentMethod, pledgeStatus, recurringFrequency, recurringStatus, rowMeta, tributeKind, uuidPk } from "./_shared";
import { appeals, campaigns, funds } from "./coding";
import { constituents } from "./constituents";
import { organizations } from "./organizations";

/**
 * Animals a donor can sponsor (fundraising Phase 2). The organization keeps the list; giving
 * pages show the ones it picks. Gifts for an animal go to its fund.
 */
export const sponsorAnimals = pgTable(
  "sponsor_animals",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** In the public "branding" storage bucket, in the organization's own folder. */
    photoPath: text("photo_path"),
    fundId: uuid("fund_id").references(() => funds.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...rowMeta,
  },
  (t) => [index("sponsor_animals_org_idx").on(t.orgId, t.sortOrder)],
);

/** Gifts are entered into a dated batch. An admin posts the batch, which locks its gifts. */
export const batches = pgTable(
  "batches",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    batchDate: day("batch_date").notNull(),
    description: text("description"),
    status: batchStatus("status").notNull().default("open"),
    /** A Stripe payout becomes one suggested batch. */
    externalSource: text("external_source"),
    externalId: text("external_id"),
    /** What the deposit slip says. Posting compares it to the gifts. */
    expectedTotal: money("expected_total"),
    expectedCount: integer("expected_count"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by"),
    notes: text("notes"),
    ...rowMeta,
  },
  (t) => [index("batches_org_status_date_idx").on(t.orgId, t.status, t.batchDate), uniqueIndex("batches_org_external_uq").on(t.orgId, t.externalSource, t.externalId)],
);

export const recurringPlans = pgTable(
  "recurring_plans",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    constituentId: uuid("constituent_id")
      .notNull()
      .references(() => constituents.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
    frequency: recurringFrequency("frequency").notNull().default("monthly"),
    startsOn: day("starts_on").notNull(),
    endsOn: day("ends_on"),
    status: recurringStatus("status").notNull().default("active"),
    fundId: uuid("fund_id").references(() => funds.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    sponsorAnimalId: uuid("sponsor_animal_id").references(() => sponsorAnimals.id, { onDelete: "set null" }),
    externalSource: externalSource("external_source").notNull().default("manual"),
    externalId: text("external_id"),
    ...rowMeta,
  },
  (t) => [index("recurring_plans_constituent_idx").on(t.constituentId)],
);

export const pledges = pgTable(
  "pledges",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    constituentId: uuid("constituent_id")
      .notNull()
      .references(() => constituents.id, { onDelete: "cascade" }),
    totalAmount: money("total_amount").notNull(),
    pledgedOn: day("pledged_on").notNull(),
    installments: integer("installments").notNull().default(1),
    frequency: recurringFrequency("frequency"),
    status: pledgeStatus("status").notNull().default("open"),
    fundId: uuid("fund_id").references(() => funds.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    appealId: uuid("appeal_id").references(() => appeals.id, { onDelete: "set null" }),
    notes: text("notes"),
    ...rowMeta,
  },
  (t) => [index("pledges_constituent_idx").on(t.constituentId)],
);

export const gifts = pgTable(
  "gifts",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // "no action" (checked at statement end) rather than "restrict": a constituent or
    // fund with gifts still cannot be deleted, but deleting the whole organization can
    // cascade through everything in one statement.
    constituentId: uuid("constituent_id")
      .notNull()
      .references(() => constituents.id, { onDelete: "no action" }),
    batchId: uuid("batch_id").references(() => batches.id, { onDelete: "set null" }),
    amount: money("amount").notNull(),
    giftDate: day("gift_date").notNull(),
    fundId: uuid("fund_id").references(() => funds.id, { onDelete: "no action" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    appealId: uuid("appeal_id").references(() => appeals.id, { onDelete: "set null" }),
    paymentMethod: paymentMethod("payment_method").notNull().default("check"),
    giftType: giftType("gift_type").notNull().default("one_time"),
    checkNumber: text("check_number"),
    reference: text("reference"),
    externalSource: externalSource("external_source").notNull().default("manual"),
    externalId: text("external_id"),
    fairMarketValue: money("fair_market_value"),
    /** Defaults to amount less fair market value. Used on statements. */
    deductibleAmount: money("deductible_amount"),
    /** Processing fee charged by the payment platform, when known. */
    feeAmount: money("fee_amount"),
    /** What reached the bank: amount less fee. */
    netAmount: money("net_amount"),
    /** Part of the amount the donor added to cover the fee. Included in amount. */
    feeCoveredAmount: money("fee_covered_amount"),
    /** Where an online gift came from: stripe, givebutter, facebook, paypal. Null for checks and cash. */
    sourcePlatform: text("source_platform"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgmentMethod: text("acknowledgment_method"),
    notes: text("notes"),
    recurringPlanId: uuid("recurring_plan_id").references(() => recurringPlans.id, { onDelete: "set null" }),
    pledgeId: uuid("pledge_id").references(() => pledges.id, { onDelete: "set null" }),
    /** For soft credits: the real gift this credit points at. */
    softCreditOfGiftId: uuid("soft_credit_of_gift_id"),
    /** For refund entries: the gift this entry reverses. A refund's amount is negative. */
    reversesGiftId: uuid("reverses_gift_id"),
    /** The optional message a donor typed on the giving form. Kept apart from staff notes. */
    donorMessage: text("donor_message"),
    sponsorAnimalId: uuid("sponsor_animal_id").references(() => sponsorAnimals.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by"),
    ...rowMeta,
  },
  (t) => [
    index("gifts_org_date_idx").on(t.orgId, t.giftDate),
    index("gifts_constituent_date_idx").on(t.constituentId, t.giftDate),
    index("gifts_batch_idx").on(t.batchId),
    index("gifts_fund_idx").on(t.fundId),
    index("gifts_org_external_idx").on(t.orgId, t.externalSource, t.externalId),
    index("gifts_reverses_idx").on(t.reversesGiftId),
  ],
);

/**
 * A gift given in honor of or in memory of a person or pet (fundraising Phase 2), with the
 * optional person the donor asked us to tell. One per gift.
 */
export const giftTributes = pgTable(
  "gift_tributes",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    giftId: uuid("gift_id")
      .notNull()
      .references(() => gifts.id, { onDelete: "cascade" }),
    kind: tributeKind("kind").notNull(),
    honoreeName: text("honoree_name").notNull(),
    notifyName: text("notify_name"),
    notifyEmail: text("notify_email"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    ...rowMeta,
  },
  (t) => [uniqueIndex("gift_tributes_gift_uq").on(t.giftId), index("gift_tributes_org_idx").on(t.orgId)],
);
