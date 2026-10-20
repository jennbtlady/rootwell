import { z } from "zod";

export const ORG_ROLES = ["owner", "admin", "staff", "board_viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const MEMBERSHIP_STATUSES = ["invited", "active", "suspended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** Roles an admin may grant. Ownership moves only through the transfer flow. */
export const grantableRole = z.enum(["admin", "staff", "board_viewer"]);

export const inviteMemberInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: grantableRole,
});
export type InviteMemberInput = z.infer<typeof inviteMemberInput>;

export const setMemberRoleInput = z.object({ role: grantableRole });
export type SetMemberRoleInput = z.infer<typeof setMemberRoleInput>;

export const transferOwnershipInput = z.object({
  toUserId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});
export type TransferOwnershipInput = z.infer<typeof transferOwnershipInput>;

/** Which roles may do what. The database enforces the same matrix in RLS. */
export const ROLE_CAN = {
  readConstituents: ["owner", "admin", "staff"],
  writeConstituents: ["owner", "admin", "staff"],
  postBatch: ["owner", "admin"],
  manageMembers: ["owner", "admin"],
  manageIntegrations: ["owner", "admin"],
  exportAll: ["owner"],
  transferOwnership: ["owner"],
  viewDashboard: ["owner", "admin", "staff", "board_viewer"],
} as const satisfies Record<string, readonly OrgRole[]>;

export function can(role: OrgRole, action: keyof typeof ROLE_CAN): boolean {
  return (ROLE_CAN[action] as readonly OrgRole[]).includes(role);
}
