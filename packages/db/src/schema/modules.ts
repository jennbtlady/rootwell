import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { orgModule, rowMeta, uuidPk } from "./_shared";
import { organizations } from "./organizations";

/**
 * Which modules each organization has (fundraising Phase 1). One row per module that is on.
 * Members can read their own organization's rows. Only the system actor writes them: a Noble
 * Maple admin turns modules on with `pnpm --filter @maple/db modules` until billing does it.
 * Every new organization starts with the Core bundle (see drizzle/custom/0016_modules.sql).
 */
export const organizationModules = pgTable(
  "organization_modules",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    module: orgModule("module").notNull(),
    enabledAt: timestamp("enabled_at", { withTimezone: true }).notNull().defaultNow(),
    ...rowMeta,
  },
  (t) => [uniqueIndex("organization_modules_org_module_uq").on(t.orgId, t.module), index("organization_modules_org_idx").on(t.orgId)],
);
