import { pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orgRole = pgEnum("org_role", ["owner", "admin", "staff", "board_viewer"]);
export const membershipStatus = pgEnum("membership_status", ["invited", "active", "suspended"]);
export const auditAction = pgEnum("audit_action", ["insert", "update", "delete", "merge", "unmerge"]);
export const actorKind = pgEnum("actor_kind", ["user", "system", "support"]);
export const ownershipEventKind = pgEnum("ownership_event_kind", ["transfer", "support_override"]);

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
