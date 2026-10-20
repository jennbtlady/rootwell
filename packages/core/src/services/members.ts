import { sql } from "drizzle-orm";
import type { InviteMemberInput, OrgRole } from "../schemas/membership";
import type { Tx } from "./types";

export type Member = {
  id: string;
  userId: string | null;
  role: OrgRole;
  status: "invited" | "active";
  email: string;
  fullName: string | null;
  joinedAt: string | null;
};

export async function listMembers(tx: Tx, orgId: string): Promise<Member[]> {
  const rows = await tx.execute(sql`
    select m.id, m.user_id, m.role, m.status, m.accepted_at,
           coalesce(p.email, m.invited_email) as email, p.full_name
      from org_memberships m
      left join profiles p on p.id = m.user_id
     where m.org_id = ${orgId} and m.status in ('active', 'invited')
     order by case m.role when 'owner' then 0 when 'admin' then 1 when 'staff' then 2 else 3 end,
              m.status, coalesce(p.full_name, p.email, m.invited_email)
  `);
  return rows.map((r) => {
    const x = r as { id: string; user_id: string | null; role: OrgRole; status: "invited" | "active"; accepted_at: string | null; email: string; full_name: string | null };
    return { id: x.id, userId: x.user_id, role: x.role, status: x.status, email: x.email, fullName: x.full_name, joinedAt: x.accepted_at };
  });
}

/** Records the invitation. The caller sends the email when status is "invited". */
export async function inviteMember(tx: Tx, orgId: string, input: InviteMemberInput): Promise<{ membershipId: string; status: "invited" | "active" }> {
  const rows = await tx.execute(sql`select * from app.invite_member(${orgId}, ${input.email}, ${input.role}::org_role)`);
  const r = rows[0] as { membership_id: string; membership_status: "invited" | "active" };
  return { membershipId: r.membership_id, status: r.membership_status };
}

/** Changes a non-owner member's role. Returns false when nothing matched (RLS or wrong org). */
export async function setMemberRole(tx: Tx, orgId: string, membershipId: string, role: Exclude<OrgRole, "owner">): Promise<boolean> {
  const r = await tx.execute(sql`
    update org_memberships set role = ${role}::org_role
     where id = ${membershipId} and org_id = ${orgId} and role <> 'owner'
  `);
  return r.count > 0;
}

/** Removes an active member or cancels an invitation. Owners cannot be removed. */
export async function removeMember(tx: Tx, orgId: string, membershipId: string): Promise<boolean> {
  const r = await tx.execute(sql`delete from org_memberships where id = ${membershipId} and org_id = ${orgId} and role <> 'owner'`);
  return r.count > 0;
}

export async function transferOwnership(tx: Tx, orgId: string, toUserId: string, reason?: string): Promise<void> {
  await tx.execute(sql`select app.transfer_ownership(${orgId}, ${toUserId}, ${reason ?? null})`);
}
