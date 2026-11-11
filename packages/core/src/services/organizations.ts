import { sql } from "drizzle-orm";
import type { CreateOrganizationInput, OrgProfileInput } from "../schemas/organization";
import type { OrgRole } from "../schemas/membership";
import type { OrgDetail, OrgSummary, Tx } from "./types";
import { resolveLayout } from "../dashboard-layout";
import { isModuleKey } from "../modules";

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
    select o.id, o.name, o.ein, o.address, o.fiscal_year_start_month, o.timezone, o.hide_board_names, o.sample_org_enabled,
           o.subscription_status, o.trial_ends_at, o.dashboard_layouts, o.branding, o.logo_path, m.role,
           coalesce((select array_agg(om.module::text order by om.module) from organization_modules om where om.org_id = o.id), '{}') as modules
      from organizations o
      join org_memberships m on m.org_id = o.id and m.user_id = app.uid() and m.status = 'active'
     where o.id = ${orgId}
  `);
  const o = rows[0] as
    | { id: string; name: string; ein: string | null; address: OrgDetail["address"] | null; fiscal_year_start_month: number; timezone: string; hide_board_names: boolean; sample_org_enabled: boolean; subscription_status: string; trial_ends_at: string | null; dashboard_layouts: Record<string, unknown> | null; branding: OrgDetail["branding"] | null; logo_path: string | null; role: OrgRole; modules: string[] }
    | undefined;
  if (!o) return null;
  return {
    id: o.id,
    name: o.name,
    ein: o.ein,
    address: o.address ?? {},
    fiscalYearStartMonth: o.fiscal_year_start_month,
    timezone: o.timezone,
    hideBoardNames: o.hide_board_names,
    isSample: o.sample_org_enabled,
    subscriptionStatus: o.subscription_status,
    trialEndsAt: o.trial_ends_at,
    role: o.role,
    modules: o.modules.filter(isModuleKey),
    branding: o.branding ?? {},
    logoPath: o.logo_path,
    dashboardLayouts: { staff: resolveLayout("staff", o.dashboard_layouts?.staff), board: resolveLayout("board", o.dashboard_layouts?.board) },
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

/** Owners and admins (with two-step sign-in) update the organization's own details. RLS enforces it. */
export async function updateOrgProfile(tx: Tx, orgId: string, input: OrgProfileInput): Promise<boolean> {
  const r = await tx.execute(sql`
    update organizations
       set name = ${input.name}, ein = ${input.ein ?? null}, address = ${JSON.stringify({ ...input.address, country: "US" })}::jsonb,
           fiscal_year_start_month = ${input.fiscalYearStartMonth}, timezone = ${input.timezone}
     where id = ${orgId}`);
  return r.count > 0;
}
