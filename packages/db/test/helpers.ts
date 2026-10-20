import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { createDb, systemClaims, userClaims, withRls, type Aal, type Claims, type Db, type RlsTx } from "../src";

export const DATABASE_URL = process.env.DATABASE_URL;
export const hasDb = Boolean(DATABASE_URL);

export type TestUser = { id: string; email: string };
export type TestOrg = {
  id: string;
  owner: TestUser;
  admin: TestUser;
  staff: TestUser;
  boardViewer: TestUser;
};

export function makeDb(): Db {
  return createDb(DATABASE_URL);
}

/** Creates a confirmed auth user directly in auth.users, the way Supabase's own tests do. */
export async function createAuthUser(db: Db, label: string): Promise<TestUser> {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@test.invalid`;
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      ${email}, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  `);
  return { id, email };
}

export async function createOrgWithTeam(db: Db, name: string): Promise<TestOrg> {
  const owner = await createAuthUser(db, "owner");
  const admin = await createAuthUser(db, "admin");
  const staff = await createAuthUser(db, "staff");
  const boardViewer = await createAuthUser(db, "board");

  const orgId = await withRls(db, userClaims(owner.id, "aal2"), async (tx) => {
    const r = await tx.execute(sql`select app.create_organization(${name}) as id`);
    return (r[0] as { id: string }).id;
  });

  await withRls(db, userClaims(owner.id, "aal2"), async (tx) => {
    for (const [u, role] of [
      [admin, "admin"],
      [staff, "staff"],
      [boardViewer, "board_viewer"],
    ] as const) {
      await tx.execute(sql`
        insert into org_memberships (org_id, user_id, role, status, accepted_at)
        values (${orgId}, ${u.id}, ${role}::org_role, 'active', now())
      `);
    }
  });

  return { id: orgId, owner, admin, staff, boardViewer };
}

export async function as<T>(db: Db, user: TestUser, fn: (tx: RlsTx) => Promise<T>, aal: Aal = "aal2") {
  return withRls(db, userClaims(user.id, aal), fn);
}

export async function asSystem<T>(db: Db, orgId: string, fn: (tx: RlsTx) => Promise<T>) {
  return withRls(db, systemClaims(orgId), fn);
}

export async function asClaims<T>(db: Db, claims: Claims, fn: (tx: RlsTx) => Promise<T>) {
  return withRls(db, claims, fn);
}

/** Every public table that carries org_id, read from the live database so new tables are covered. */
export async function tenantTables(db: Db): Promise<string[]> {
  const rows = await db.execute(sql`
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'org_id'
     order by table_name
  `);
  return rows.map((r) => (r as { table_name: string }).table_name);
}

/** Runs a statement and returns the Postgres error code, or null if it succeeded. */
export async function errorCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    return code ?? "unknown";
  }
}

export async function cleanup(db: Db, orgs: TestOrg[]) {
  const raw = postgres(DATABASE_URL!, { max: 1 });
  for (const o of orgs) {
    await raw`delete from organizations where id = ${o.id}`;
    for (const u of [o.owner, o.admin, o.staff, o.boardViewer]) {
      await raw`delete from auth.users where id = ${u.id}`;
    }
  }
  await raw.end();
}
