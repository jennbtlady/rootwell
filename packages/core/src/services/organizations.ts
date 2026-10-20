import { sql } from "drizzle-orm";
import type { CreateOrganizationInput } from "../schemas/organization";
import type { OrgRole } from "../schemas/membership";
import type { OrgDetail, OrgSummary, Tx } from "./types";

export async function listMyOrgs(tx: Tx): Promise<OrgSummary[]> {
  const rows = await tx.execute(sql`
    select o.id, o.name, o.fiscal_year_start_month, o.timezone, o.subscription_status, o.sample_org_enabled, m.role
      from organizations o
      join org_memberships m on m.org_id = o.id and m.user_id = app.uid() and m.status = 'active'
     order by o.name
  `);
  return rows.map((r) => {
    const x = r as { id: string; name: string; fiscal_year_start_month: number; timezone: string; subscription_status: string; sample_org_enabled: boolean; role: OrgRole };
    return { id: x.id, name: x.name, fiscalYearStartMonth: x.fiscal_year_start_month, timezone: x.timezone, subscriptionStatus: x.subscription_status, isSample: x.sample_org_enabled, role: x.role };
  });
}

/** Null when the org does not exist or the caller is not a member. RLS makes those identical. */
export async function getOrg(tx: Tx, orgId: string): Promise<OrgDetail | null> {
  const rows = await tx.execute(sql`
    select o.id, o.name, o.ein, o.fiscal_year_start_month, o.timezone, o.hide_board_names, o.sample_org_enabled,
           o.subscription_status, o.trial_ends_at, m.role
      from organizations o
      join org_memberships m on m.org_id = o.id and m.user_id = app.uid() and m.status = 'active'
     where o.id = ${orgId}
  `);
  const o = rows[0] as
    | { id: string; name: string; ein: string | null; fiscal_year_start_month: number; timezone: string; hide_board_names: boolean; sample_org_enabled: boolean; subscription_status: string; trial_ends_at: string | null; role: OrgRole }
    | undefined;
  if (!o) return null;
  return {
    id: o.id,
    name: o.name,
    ein: o.ein,
    fiscalYearStartMonth: o.fiscal_year_start_month,
    timezone: o.timezone,
    hideBoardNames: o.hide_board_names,
    isSample: o.sample_org_enabled,
    subscriptionStatus: o.subscription_status,
    trialEndsAt: o.trial_ends_at,
    role: o.role,
  };
}

/** Each person gets one clearly labeled demo organization to click around in. */
export async function createSampleOrg(tx: Tx): Promise<{ id: string }> {
  const r = await tx.execute(sql`select app.create_sample_org() as id`);
  return { id: (r[0] as { id: string }).id };
}

/** Only the sample organization can be deleted this way, and only by its owner. */
export async function deleteSampleOrg(tx: Tx, orgId: string): Promise<void> {
  await tx.execute(sql`select app.delete_sample_org(${orgId})`);
}

/** Creates the org and makes the caller its owner in one database function call. */
export async function createOrg(tx: Tx, input: CreateOrganizationInput): Promise<{ id: string }> {
  const r = await tx.execute(
    sql`select app.create_organization(${input.name}, ${input.fiscalYearStartMonth}, ${input.timezone}) as id`,
  );
  return { id: (r[0] as { id: string }).id };
}
