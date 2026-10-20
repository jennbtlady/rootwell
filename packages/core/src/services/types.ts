import type { RlsTx } from "@maple/db";
import type { OrgRole } from "../schemas/membership";

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
  fiscalYearStartMonth: number;
  timezone: string;
  hideBoardNames: boolean;
  isSample: boolean;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  role: OrgRole;
};
