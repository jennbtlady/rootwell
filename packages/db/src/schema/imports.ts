import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { importKind, importRowAction, importStatus, rowMeta, uuidPk } from "./_shared";
import { batches } from "./gifts";
import { organizations } from "./organizations";

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: importKind("kind").notNull(),
    fileName: text("file_name").notNull(),
    headers: text("headers").array().notNull(),
    expectedRows: integer("expected_rows").notNull(),
    status: importStatus("status").notNull().default("uploading"),
    /** field -> header */
    mapping: jsonb("mapping").$type<Record<string, string>>().notNull().default({}),
    batchId: uuid("batch_id").references(() => batches.id, { onDelete: "set null" }),
    /** ids of funds, campaigns and appeals the commit created, for rollback. */
    created: jsonb("created").notNull().default({}),
    summary: jsonb("summary").notNull().default({}),
    // Choices made while reviewing the file: { thankedBefore: "YYYY-MM-DD" | null,
    // coding: { fund: { "<value in file>": "<id>" | "new" }, campaign: {...}, appeal: {...} } }.
    options: jsonb("options").notNull().default({}),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
    ...rowMeta,
  },
  (t) => [index("import_jobs_org_idx").on(t.orgId, t.createdAt)],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    raw: text("raw").array().notNull(),
    /** field -> text after mapping. Fix in place edits this. */
    fields: jsonb("fields").notNull().default({}),
    /** normalized { person, gift } */
    mapped: jsonb("mapped"),
    errors: jsonb("errors").notNull().default([]),
    warnings: jsonb("warnings").notNull().default([]),
    personKey: text("person_key"),
    action: importRowAction("action").notNull().default("create"),
    matchConstituentId: uuid("match_constituent_id"),
    candidates: jsonb("candidates").notNull().default([]),
    createdConstituentId: uuid("created_constituent_id"),
    createdGiftId: uuid("created_gift_id"),
    ...rowMeta,
  },
  (t) => [uniqueIndex("import_rows_job_row_uq").on(t.jobId, t.rowNumber), index("import_rows_job_person_idx").on(t.jobId, t.personKey), index("import_rows_job_action_idx").on(t.jobId, t.action)],
);

export const importMappings = pgTable(
  "import_mappings",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: importKind("kind").notNull(),
    headers: text("headers").array().notNull(),
    mapping: jsonb("mapping").$type<Record<string, string>>().notNull(),
    ...rowMeta,
  },
  (t) => [uniqueIndex("import_mappings_org_name_uq").on(t.orgId, t.name)],
);
