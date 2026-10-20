import { sql } from "drizzle-orm";
import type { Me, Tx } from "./types";

/** The signed-in person's profile and active memberships. RLS limits this to their own row. */
export async function getMe(tx: Tx, userId: string): Promise<Me | null> {
  const rows = await tx.execute(sql`
    select p.id, p.email, p.full_name,
           coalesce(json_agg(json_build_object('orgId', m.org_id, 'orgName', o.name, 'role', m.role)
                    order by o.name) filter (where m.id is not null), '[]') as memberships
      from profiles p
      left join org_memberships m on m.user_id = p.id and m.status = 'active'
      left join organizations o on o.id = m.org_id
     where p.id = ${userId}
     group by p.id
  `);
  const r = rows[0] as { id: string; email: string; full_name: string | null; memberships: Me["memberships"] } | undefined;
  if (!r) return null;
  return { id: r.id, email: r.email, fullName: r.full_name, memberships: r.memberships };
}

/**
 * True when this person holds owner or admin in any organization. Those roles must
 * complete MFA enrollment before using the app. The database also enforces aal2 on
 * their sensitive writes, so this is the friendly gate, not the only one.
 */
export async function mfaRequiredFor(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx.execute(sql`
    select 1 from org_memberships
     where user_id = ${userId} and status = 'active' and role in ('owner', 'admin')
     limit 1
  `);
  return rows.length > 0;
}
