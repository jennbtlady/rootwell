import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

/**
 * Creates the people and organization the flows need: one org, an owner who also
 * plays admin, and a staff member. Credentials are generated per run and written to
 * e2e/.state.json (gitignored). Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
 * DATABASE_URL, and MFA_ENFORCEMENT=off on the server under test.
 */
export type E2EState = {
  run: string;
  orgId: string;
  orgName: string;
  owner: { email: string; password: string; id: string };
  staff: { email: string; password: string; id: string };
};

export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const dbUrl = process.env.DATABASE_URL;
  if (!url || !key || !dbUrl) throw new Error("e2e needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and DATABASE_URL");

  const run = randomUUID().slice(0, 8);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const mk = async (label: string) => {
    const email = `e2e-${label}-${run}@test.invalid`;
    const password = `e2e-${randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `E2E ${label}` } });
    if (error || !data.user) throw error ?? new Error("could not create user");
    return { email, password, id: data.user.id };
  };
  const owner = await mk("owner");
  const staff = await mk("staff");

  const sql = postgres(dbUrl, { max: 1 });
  const orgName = `E2E Pantry ${run}`;
  const [{ id: orgId }] = await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: owner.id, role: "authenticated", aal: "aal2", actor: "user" })}, true)`;
    await tx`set local role authenticated`;
    return tx<{ id: string }[]>`select app.create_organization(${orgName}) as id`;
  });
  await sql`insert into org_memberships (org_id, user_id, role, status, accepted_at) values (${orgId}, ${staff.id}, 'staff', 'active', now())`;
  await sql.end();

  const state: E2EState = { run, orgId, orgName, owner, staff };
  mkdirSync("e2e/.state", { recursive: true });
  writeFileSync("e2e/.state/state.json", JSON.stringify(state, null, 2));
}
