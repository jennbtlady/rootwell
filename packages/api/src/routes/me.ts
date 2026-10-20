import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { withRls } from "@maple/db";
import type { ApiEnv } from "../env";
import { getDb } from "../db";

export const me = new Hono<ApiEnv>().get("/", async (c) => {
  const claims = c.get("claims");
  const result = await withRls(getDb(), claims, async (tx) => {
    const rows = await tx.execute(sql`
      select p.id, p.email, p.full_name,
             coalesce(json_agg(json_build_object('orgId', m.org_id, 'orgName', o.name, 'role', m.role)
                      order by o.name) filter (where m.id is not null), '[]') as memberships
        from profiles p
        left join org_memberships m on m.user_id = p.id and m.status = 'active'
        left join organizations o on o.id = m.org_id
       where p.id = ${claims.sub}
       group by p.id
    `);
    return rows[0] as
      | { id: string; email: string; full_name: string | null; memberships: { orgId: string; orgName: string; role: string }[] }
      | undefined;
  });
  if (!result) return c.json({ error: "Profile not found" }, 404);
  return c.json({
    id: result.id,
    email: result.email,
    fullName: result.full_name,
    mfaComplete: claims.aal === "aal2",
    memberships: result.memberships,
  });
});
