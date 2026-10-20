import { index, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { duplicateStatus, rowMeta, uuidPk } from "./_shared";
import { constituents } from "./constituents";
import { organizations } from "./organizations";
import { profiles } from "./profiles";

/** A scored pair of constituents that might be the same person. a < b keeps pairs unique. */
export const duplicateCandidates = pgTable(
  "duplicate_candidates",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    aId: uuid("a_id")
      .notNull()
      .references(() => constituents.id, { onDelete: "cascade" }),
    bId: uuid("b_id")
      .notNull()
      .references(() => constituents.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    reasons: text("reasons").array().notNull().default(sql`'{}'::text[]`),
    status: duplicateStatus("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => profiles.id, { onDelete: "set null" }),
    ...rowMeta,
  },
  (t) => [uniqueIndex("duplicate_candidates_pair_uq").on(t.orgId, t.aId, t.bId), index("duplicate_candidates_org_status_idx").on(t.orgId, t.status, t.score)],
);

export type MergeDecisions = Record<string, "a" | "b">;

/** Everything needed to undo a merge for 30 days. */
export const mergeHistory = pgTable(
  "merge_history",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    survivingId: uuid("surviving_id")
      .notNull()
      .references(() => constituents.id, { onDelete: "cascade" }),
    /** The deleted record's id. Restored with the same id on undo. */
    mergedId: uuid("merged_id").notNull(),
    mergedDisplayName: text("merged_display_name").notNull(),
    decisions: jsonb("decisions").$type<MergeDecisions>().notNull().default({}),
    snapshot: jsonb("snapshot").notNull(),
    reversibleUntil: timestamp("reversible_until", { withTimezone: true }).notNull(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedBy: uuid("reversed_by"),
    ...rowMeta,
  },
  (t) => [index("merge_history_org_idx").on(t.orgId, t.createdAt), index("merge_history_surviving_idx").on(t.survivingId)],
);
