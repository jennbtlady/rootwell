/**
 * Turn modules on or off for an organization (fundraising Phase 1). For a Noble Maple admin,
 * until billing does this. Runs as the system actor for that one organization, so the change
 * goes through RLS and lands in the audit log like any other.
 *
 *   DATABASE_URL=... pnpm --filter @maple/api modules <org id or exact name>
 *       shows the organization's modules
 *   DATABASE_URL=... pnpm --filter @maple/api modules <org> on fundraising
 *   DATABASE_URL=... pnpm --filter @maple/api modules <org> off events
 *
 * Bundles and modules are listed in packages/core/src/modules.ts. Core (donations) is on for
 * every organization; turning it off hides giving pages and stops online gifts.
 */
import { sql } from "drizzle-orm";
import { createDb, systemClaims, withRls } from "@maple/db";
import { BUNDLES, expandModules, MODULE_LABELS, MODULES } from "@maple/core";
import { listOrgModules } from "@maple/core/services";

const [who, action, ...names] = process.argv.slice(2);
if (!who || (action && action !== "on" && action !== "off") || (action && !names.length)) {
  console.log("Usage: modules <org id or exact name> [on|off <bundle or module>...]");
  console.log(`Bundles: ${Object.entries(BUNDLES).map(([b, m]) => `${b} (${m.join(", ")})`).join("; ")}`);
  console.log(`Modules: ${MODULES.join(", ")}`);
  process.exit(1);
}

const db = createDb();
try {
  const isId = /^[0-9a-f-]{36}$/i.test(who);
  const orgs = (await db.execute(isId ? sql`select id, name from organizations where id = ${who}` : sql`select id, name from organizations where name = ${who}`)) as unknown as { id: string; name: string }[];
  if (orgs.length !== 1) throw new Error(orgs.length ? `${orgs.length} organizations are named "${who}". Use the id.` : `No organization matches "${who}".`);
  const org = orgs[0]!;
  const modules = action ? expandModules(names) : [];

  const after = await withRls(db, systemClaims(org.id), async (tx) => {
    for (const m of modules) {
      if (action === "on") await tx.execute(sql`insert into organization_modules (org_id, module) values (${org.id}, ${m}::org_module) on conflict do nothing`);
      else await tx.execute(sql`delete from organization_modules where org_id = ${org.id} and module = ${m}::org_module`);
    }
    return listOrgModules(tx, org.id);
  });

  console.log(`${org.name} (${org.id})`);
  if (action) console.log(`Turned ${action}: ${modules.join(", ")}`);
  for (const m of MODULES) console.log(`  [${after.includes(m) ? "on " : "off"}] ${MODULE_LABELS[m]}`);
} finally {
  await db.$client.end();
}
