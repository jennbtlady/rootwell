import { boolean, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { day, money, rowMeta, uuidPk } from "./_shared";
import { organizations } from "./organizations";

/** Funds, campaigns and appeals: the three standard ways a gift is coded. */
const codingColumns = () => ({
  id: uuidPk(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  startsOn: day("starts_on"),
  endsOn: day("ends_on"),
  ...rowMeta,
});

export const funds = pgTable("funds", { ...codingColumns(), /** QuickBooks income account name. */ incomeAccount: text("income_account") }, (t) => [
  uniqueIndex("funds_org_name_uq").on(t.orgId, t.name),
  uniqueIndex("funds_org_code_uq").on(t.orgId, t.code),
]);

export const campaigns = pgTable("campaigns", { ...codingColumns(), goalAmount: money("goal_amount") }, (t) => [
  uniqueIndex("campaigns_org_name_uq").on(t.orgId, t.name),
  uniqueIndex("campaigns_org_code_uq").on(t.orgId, t.code),
]);

export const appeals = pgTable(
  "appeals",
  {
    ...codingColumns(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("appeals_org_name_uq").on(t.orgId, t.name),
    uniqueIndex("appeals_org_code_uq").on(t.orgId, t.code),
    index("appeals_campaign_idx").on(t.campaignId),
  ],
);
