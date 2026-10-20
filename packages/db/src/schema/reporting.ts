import { boolean, date, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ackChannel, ackStatus, rowMeta, uuidPk } from "./_shared";
import { gifts } from "./gifts";
import { organizations } from "./organizations";

/** One computed dashboard per organization per day. The page reads the latest. */
export const dashboardSnapshots = pgTable(
  "dashboard_snapshots",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    asOf: date("as_of", { mode: "string" }).notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().default(sql`now()`),
    data: jsonb("data").notNull(),
    ...rowMeta,
  },
  (t) => [uniqueIndex("dashboard_snapshots_org_day_uq").on(t.orgId, t.asOf)],
);

/** Read-only board links. Only a hash of the token is stored. */
export const boardShareLinks = pgTable(
  "board_share_links",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    ...rowMeta,
  },
  (t) => [uniqueIndex("board_share_links_token_uq").on(t.tokenHash)],
);

export const acknowledgmentTemplates = pgTable(
  "acknowledgment_templates",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    channel: ackChannel("channel").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    signature: text("signature"),
    isDefault: boolean("is_default").notNull().default(false),
    ...rowMeta,
  },
  (t) => [uniqueIndex("acknowledgment_templates_org_name_uq").on(t.orgId, t.name)],
);

export const acknowledgments = pgTable(
  "acknowledgments",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    giftId: uuid("gift_id")
      .notNull()
      .references(() => gifts.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => acknowledgmentTemplates.id, { onDelete: "set null" }),
    channel: ackChannel("channel").notNull(),
    status: ackStatus("status").notNull(),
    recipient: text("recipient"),
    error: text("error"),
    ...rowMeta,
  },
  (t) => [index("acknowledgments_gift_idx").on(t.giftId), index("acknowledgments_org_created_idx").on(t.orgId, t.createdAt)],
);
