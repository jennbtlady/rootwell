import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { actorKind, auditAction, ownershipEventKind } from "./_shared";
import { organizations } from "./organizations";
import { profiles } from "./profiles";

/**
 * Written only by the app.audit_trigger() function (security definer).
 * No insert, update or delete policy exists for any role.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id"),
    actorKind: actorKind("actor_kind").notNull().default("user"),
    tableName: text("table_name").notNull(),
    rowId: uuid("row_id").notNull(),
    action: auditAction("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index("audit_log_org_created_idx").on(t.orgId, t.createdAt),
    index("audit_log_row_idx").on(t.tableName, t.rowId),
  ],
);

/**
 * Every ownership change, including Noble Maple support overrides, with a reason.
 * User references null out if that person's account is deleted, so the history survives.
 */
export const ownershipEvents = pgTable("ownership_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  kind: ownershipEventKind("kind").notNull(),
  fromUserId: uuid("from_user_id").references(() => profiles.id, { onDelete: "set null" }),
  toUserId: uuid("to_user_id").references(() => profiles.id, { onDelete: "set null" }),
  performedBy: uuid("performed_by"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});
