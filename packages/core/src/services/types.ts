import type { RlsTx } from "@maple/db";
import type { OrgRole } from "../schemas/membership";
import type { DashboardView, LayoutItem } from "../dashboard-layout";
import type { ModuleKey } from "../modules";
import type { OrgBranding } from "../branding";

/** Every service takes the RLS-scoped transaction first. Nothing here opens its own. */
export type Tx = RlsTx;

export type Membership = { orgId: string; orgName: string; role: string };

export type Me = {
  id: string;
  email: string;
  fullName: string | null;
  memberships: Membership[];
};

export type OrgSummary = {
  id: string;
  name: string;
  fiscalYearStartMonth: number;
  timezone: string;
  subscriptionStatus: string;
  isSample: boolean;
  role: OrgRole;
};

export type OrgDetail = {
  id: string;
  name: string;
  ein: string | null;
  address: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string };
  fiscalYearStartMonth: number;
  timezone: string;
  hideBoardNames: boolean;
  isSample: boolean;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  role: OrgRole;
  /** The modules this organization has (packages/core/src/modules.ts). */
  modules: ModuleKey[];
  /** How public pages look. Image paths point into the public "branding" storage bucket. */
  branding: OrgBranding;
  logoPath: string | null;
  /** Card order and visibility per dashboard, already resolved against the current card list. */
  dashboardLayouts: Record<DashboardView, LayoutItem[]>;
};
