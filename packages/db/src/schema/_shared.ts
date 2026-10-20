import { date, numeric, pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orgRole = pgEnum("org_role", ["owner", "admin", "staff", "board_viewer"]);
export const membershipStatus = pgEnum("membership_status", ["invited", "active", "suspended"]);
export const auditAction = pgEnum("audit_action", ["insert", "update", "delete", "merge", "unmerge"]);
export const actorKind = pgEnum("actor_kind", ["user", "system", "support"]);
export const ownershipEventKind = pgEnum("ownership_event_kind", ["transfer", "support_override"]);

export const constituentType = pgEnum("constituent_type", ["person", "household", "organization"]);
export const contactPointType = pgEnum("contact_point_type", ["home", "work", "mobile", "mailing", "other"]);
export const interactionType = pgEnum("interaction_type", ["call", "meeting", "email", "letter", "event", "note", "other"]);
export const batchStatus = pgEnum("batch_status", ["open", "posted"]);
export const giftType = pgEnum("gift_type", ["one_time", "recurring", "pledge", "pledge_payment", "in_kind", "soft_credit"]);
export const paymentMethod = pgEnum("payment_method", ["check", "cash", "card", "ach", "stock", "in_kind", "other"]);
export const externalSource = pgEnum("external_source", ["manual", "stripe", "import"]);
export const recurringFrequency = pgEnum("recurring_frequency", ["monthly", "quarterly", "annual"]);
export const recurringStatus = pgEnum("recurring_status", ["active", "paused", "ended"]);
export const pledgeStatus = pgEnum("pledge_status", ["open", "fulfilled", "written_off"]);
export const duplicateStatus = pgEnum("duplicate_status", ["open", "merged", "not_duplicate"]);
export const importKind = pgEnum("import_kind", ["constituents", "constituents_gifts"]);
export const importStatus = pgEnum("import_status", ["uploading", "ready", "committed", "rolled_back"]);
export const importRowAction = pgEnum("import_row_action", ["create", "match", "review", "skip", "error"]);
export const ackChannel = pgEnum("ack_channel", ["letter", "email", "phone", "in_person"]);
export const ackStatus = pgEnum("ack_status", ["sent", "marked", "failed"]);

/**
 * Columns every tenant-scoped table carries. created_by/updated_by are filled by the
 * app.set_row_meta trigger from the JWT claims, so application code never sets them.
 */
export const rowMeta = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
};

export const uuidPk = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
export const money = (name: string) => numeric(name, { precision: 12, scale: 2 });
export const day = (name: string) => date(name, { mode: "string" });
