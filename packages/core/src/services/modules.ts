import { sql } from "drizzle-orm";
import type { ModuleKey } from "../modules";
import type { Tx } from "./types";

/**
 * Whether an organization has a module. Works signed in or signed out (the public giving
 * page), through app.org_has_module, which says nothing else about the organization.
 */
export async function orgHasModule(tx: Tx, orgId: string, module: ModuleKey): Promise<boolean> {
  const rows = await tx.execute(sql`select app.org_has_module(${orgId}::uuid, ${module}::org_module) as ok`);
  return (rows[0] as { ok: boolean }).ok;
}

/** The modules an organization has, for members. */
export async function listOrgModules(tx: Tx, orgId: string): Promise<ModuleKey[]> {
  const rows = await tx.execute(sql`select module::text as m from organization_modules where org_id = ${orgId} order by module`);
  return (rows as unknown as { m: ModuleKey }[]).map((r) => r.m);
}
