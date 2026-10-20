import { boolean, index, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { constituentType, contactPointType, day, rowMeta, uuidPk } from "./_shared";
import { organizations } from "./organizations";
import { profiles } from "./profiles";

export type CustomFields = Record<string, string | number | boolean | null>;

export const constituents = pgTable(
  "constituents",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: constituentType("type").notNull().default("person"),
    prefix: text("prefix"),
    firstName: text("first_name"),
    middleName: text("middle_name"),
    lastName: text("last_name"),
    suffix: text("suffix"),
    preferredName: text("preferred_name"),
    /** Household or organization name. */
    orgName: text("org_name"),
    // Kept by app.set_constituent_names(). Never written by application code.
    displayName: text("display_name").notNull().default(""),
    sortName: text("sort_name").notNull().default(""),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    doNotEmail: boolean("do_not_email").notNull().default(false),
    doNotMail: boolean("do_not_mail").notNull().default(false),
    doNotCall: boolean("do_not_call").notNull().default(false),
    deceased: boolean("deceased").notNull().default(false),
    deceasedOn: day("deceased_on"),
    source: text("source"),
    assignedTo: uuid("assigned_to").references(() => profiles.id, { onDelete: "set null" }),
    notes: text("notes"),
    customFields: jsonb("custom_fields").$type<CustomFields>().notNull().default({}),
    ...rowMeta,
  },
  (t) => [
    index("constituents_org_sort_idx").on(t.orgId, t.sortName),
    // pg_trgm index for search and duplicate matching. Created in custom SQL because
    // drizzle-kit does not express operator classes.
  ],
);

export const constituentEmails = pgTable(
  "constituent_emails",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    constituentId: uuid("constituent_id")
      .notNull()
      .references(() => constituents.id, { onDelete: "cascade" }),
    /** Stored lower-cased and trimmed by trigger. */
    email: text("email").notNull(),
    type: contactPointType("type").notNull().default("home"),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...rowMeta,
  },
  (t) => [uniqueIndex("constituent_emails_uq").on(t.constituentId, t.email), index("constituent_emails_org_email_idx").on(t.orgId, t.email)],
);

export const constituentPhones = pgTable(
  "constituent_phones",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    constituentId: uuid("constituent_id")
      .notNull()
      .references(() => constituents.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    /** Digits only, kept by trigger, used for matching. */
    digits: text("digits").notNull().default(""),
    type: contactPointType("type").notNull().default("mobile"),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...rowMeta,
  },
  (t) => [index("constituent_phones_org_digits_idx").on(t.orgId, t.digits), index("constituent_phones_constituent_idx").on(t.constituentId)],
);

export const constituentAddresses = pgTable(
  "constituent_addresses",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    constituentId: uuid("constituent_id")
      .notNull()
      .references(() => constituents.id, { onDelete: "cascade" }),
    line1: text("line1"),
    line2: text("line2"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    country: text("country").notNull().default("US"),
    type: contactPointType("type").notNull().default("home"),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...rowMeta,
  },
  (t) => [index("constituent_addresses_constituent_idx").on(t.constituentId)],
);

export const tags = pgTable(
  "tags",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...rowMeta,
  },
  (t) => [uniqueIndex("tags_org_name_uq").on(t.orgId, t.name)],
);

export const constituentTags = pgTable(
  "constituent_tags",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    constituentId: uuid("constituent_id")
      .notNull()
      .references(() => constituents.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: rowMeta.createdAt,
    createdBy: rowMeta.createdBy,
  },
  (t) => [primaryKey({ columns: [t.constituentId, t.tagId] }), index("constituent_tags_tag_idx").on(t.tagId)],
);

export const relationships = pgTable(
  "relationships",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fromConstituentId: uuid("from_constituent_id")
      .notNull()
      .references(() => constituents.id, { onDelete: "cascade" }),
    toConstituentId: uuid("to_constituent_id")
      .notNull()
      .references(() => constituents.id, { onDelete: "cascade" }),
    /** e.g. spouse, parent, employee, board_member. Free text from a short suggested list. */
    type: text("type").notNull(),
    /** How the other side sees it, e.g. child, employer, organization. */
    reciprocalType: text("reciprocal_type"),
    notes: text("notes"),
    ...rowMeta,
  },
  (t) => [
    index("relationships_from_idx").on(t.fromConstituentId),
    index("relationships_to_idx").on(t.toConstituentId),
    uniqueIndex("relationships_uq").on(t.fromConstituentId, t.toConstituentId, t.type),
  ],
);
