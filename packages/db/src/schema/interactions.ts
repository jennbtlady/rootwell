import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { day, interactionType, rowMeta, uuidPk } from "./_shared";
import { constituents } from "./constituents";
import { organizations } from "./organizations";
import { profiles } from "./profiles";

export const interactions = pgTable(
  "interactions",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    constituentId: uuid("constituent_id")
      .notNull()
      .references(() => constituents.id, { onDelete: "cascade" }),
    type: interactionType("type").notNull().default("note"),
    occurredOn: day("occurred_on").notNull(),
    summary: text("summary").notNull(),
    details: text("details"),
    ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
    ...rowMeta,
  },
  (t) => [index("interactions_constituent_date_idx").on(t.constituentId, t.occurredOn), index("interactions_org_date_idx").on(t.orgId, t.occurredOn)],
);
