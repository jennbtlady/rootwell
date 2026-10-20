import type { OrgRole } from "@maple/core";

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
  board_viewer: "Board viewer",
};

export const ROLE_HELP: Record<Exclude<OrgRole, "owner">, string> = {
  admin: "Everything except transferring ownership. Can post gift batches and manage the team.",
  staff: "Enters donors, gifts and notes. Cannot post batches or change settings.",
  board_viewer: "Sees the dashboard and reports only. No donor contact details, no exports.",
};
