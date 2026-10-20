import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, userClaims, withRls, type Db } from "@maple/db";
import { app, setDb, setSupabaseAdmin, setVerifier } from "../src";

/**
 * Route matrix against a real database. Tokens are fake: the verifier is swapped
 * so "token:<userId>:<aal>" stands in for a Supabase JWT.
 */
const DATABASE_URL = process.env.DATABASE_URL;

type U = { id: string; email: string };

async function createUser(db: Db, label: string): Promise<U> {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@test.invalid`;
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${email}, '',
      now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  `);
  return { id, email };
}

const auth = (u: U, aal: "aal1" | "aal2" = "aal2") => ({ authorization: `Bearer token:${u.id}:${aal}` });
const json = { "content-type": "application/json" };

describe.skipIf(!DATABASE_URL)("api routes against the database", () => {
  let db: Db;
  let ownerA: U;
  let staffA: U;
  let ownerB: U;
  let orgA = "";
  let orgB = "";

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    setDb(db);
    setVerifier(async (token) => {
      const [, sub, aal] = token.split(":");
      if (!sub) throw new Error("bad token");
      return { sub, aal };
    });
    // Invitations would call Supabase Auth; stub the admin client.
    setSupabaseAdmin({ auth: { admin: { inviteUserByEmail: async () => ({ data: {}, error: null }) } } } as never);

    ownerA = await createUser(db, "owner-a");
    staffA = await createUser(db, "staff-a");
    ownerB = await createUser(db, "owner-b");

    const mk = async (u: U, name: string) => {
      const res = await app.request("/api/v1/orgs", { method: "POST", headers: { ...auth(u), ...json }, body: JSON.stringify({ name }) });
      expect(res.status).toBe(201);
      return ((await res.json()) as { id: string }).id;
    };
    orgA = await mk(ownerA, "Route Org A");
    orgB = await mk(ownerB, "Route Org B");
    await withRls(db, userClaims(ownerA.id, "aal2"), (tx) => tx.execute(sql`select * from app.invite_member(${orgA}, ${staffA.email}, 'staff')`));
  });

  afterAll(async () => {
    for (const id of [orgA, orgB]) await db.execute(sql`delete from organizations where id = ${id}`);
    for (const u of [ownerA, staffA, ownerB]) await db.execute(sql`delete from auth.users where id = ${u.id}`);
    setVerifier(undefined);
    setSupabaseAdmin(undefined);
    setDb(undefined);
  });

  it("lists only the caller's orgs", async () => {
    const res = await app.request("/api/v1/orgs", { headers: auth(ownerA) });
    const body = (await res.json()) as { orgs: { id: string; role: string }[] };
    expect(body.orgs.map((o) => o.id)).toEqual([orgA]);
    expect(body.orgs[0]?.role).toBe("owner");
  });

  it("hides org B from org A's people on every org route", async () => {
    for (const [method, path, body] of [
      ["GET", `/api/v1/orgs/${orgB}`, undefined],
      ["GET", `/api/v1/orgs/${orgB}/members`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/members`, { email: "x@test.invalid", role: "staff" }],
      ["PATCH", `/api/v1/orgs/${orgB}/members/${randomUUID()}`, { role: "admin" }],
      ["POST", `/api/v1/orgs/${orgB}/members/${randomUUID()}/resend`, undefined],
      ["DELETE", `/api/v1/orgs/${orgB}/members/${randomUUID()}`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/transfer-ownership`, { toUserId: ownerA.id }],
      ["DELETE", `/api/v1/orgs/${orgB}`, undefined],
    ] as const) {
      const res = await app.request(path, { method, headers: { ...auth(ownerA), ...json }, body: body ? JSON.stringify(body) : undefined });
      expect([403, 404], `${method} ${path} -> ${res.status}`).toContain(res.status);
      const text = await res.text();
      expect(text).not.toContain(orgB);
      expect(text).not.toContain("Route Org B");
    }
  });

  it("staff can see members but cannot invite, and MFA is required to invite", async () => {
    const list = await app.request(`/api/v1/orgs/${orgA}/members`, { headers: auth(staffA) });
    expect(list.status).toBe(200);
    const members = ((await list.json()) as { members: { email: string; role: string }[] }).members;
    expect(members.map((m) => m.role)).toEqual(["owner", "staff"]);

    const asStaff = await app.request(`/api/v1/orgs/${orgA}/members`, { method: "POST", headers: { ...auth(staffA), ...json }, body: JSON.stringify({ email: "new@test.invalid", role: "staff" }) });
    expect(asStaff.status).toBe(403);
    const noMfa = await app.request(`/api/v1/orgs/${orgA}/members`, { method: "POST", headers: { ...auth(ownerA, "aal1"), ...json }, body: JSON.stringify({ email: "new@test.invalid", role: "staff" }) });
    expect(noMfa.status).toBe(403);
  });

  it("owner invites, changes a role, and removes a member", async () => {
    const invite = await app.request(`/api/v1/orgs/${orgA}/members`, { method: "POST", headers: { ...auth(ownerA), ...json }, body: JSON.stringify({ email: "Pending@Test.invalid", role: "board_viewer" }) });
    expect(invite.status).toBe(201);
    const { membershipId, status } = (await invite.json()) as { membershipId: string; status: string };
    expect(status).toBe("invited");

    const again = await app.request(`/api/v1/orgs/${orgA}/members`, { method: "POST", headers: { ...auth(ownerA), ...json }, body: JSON.stringify({ email: "pending@test.invalid", role: "staff" }) });
    expect(again.status).toBe(409);

    const patch = await app.request(`/api/v1/orgs/${orgA}/members/${membershipId}`, { method: "PATCH", headers: { ...auth(ownerA), ...json }, body: JSON.stringify({ role: "staff" }) });
    expect(patch.status).toBe(200);

    const del = await app.request(`/api/v1/orgs/${orgA}/members/${membershipId}`, { method: "DELETE", headers: auth(ownerA) });
    expect(del.status).toBe(204);
  });

  it("only the owner can transfer ownership, and afterwards roles are swapped", async () => {
    const denied = await app.request(`/api/v1/orgs/${orgA}/transfer-ownership`, { method: "POST", headers: { ...auth(staffA), ...json }, body: JSON.stringify({ toUserId: staffA.id }) });
    expect(denied.status).toBe(403);
    const noMfa = await app.request(`/api/v1/orgs/${orgA}/transfer-ownership`, { method: "POST", headers: { ...auth(ownerA, "aal1"), ...json }, body: JSON.stringify({ toUserId: staffA.id }) });
    expect(noMfa.status).toBe(403);

    const ok = await app.request(`/api/v1/orgs/${orgA}/transfer-ownership`, { method: "POST", headers: { ...auth(ownerA), ...json }, body: JSON.stringify({ toUserId: staffA.id, reason: "handing over" }) });
    expect(ok.status).toBe(200);

    const list = await app.request(`/api/v1/orgs/${orgA}/members`, { headers: auth(staffA) });
    const members = ((await list.json()) as { members: { userId: string; role: string }[] }).members;
    expect(members.find((m) => m.userId === staffA.id)?.role).toBe("owner");
    expect(members.find((m) => m.userId === ownerA.id)?.role).toBe("admin");

    // Hand it back so the rest of the file sees the original roles.
    const back = await app.request(`/api/v1/orgs/${orgA}/transfer-ownership`, { method: "POST", headers: { ...auth(staffA), ...json }, body: JSON.stringify({ toUserId: ownerA.id }) });
    expect(back.status).toBe(200);
    // The former owner is an admin now, not staff. Put them back.
    const row = await withRls(db, userClaims(ownerA.id, "aal2"), async (tx) => (await tx.execute(sql`select id from org_memberships where org_id = ${orgA} and user_id = ${staffA.id}`))[0] as { id: string });
    const reset = await app.request(`/api/v1/orgs/${orgA}/members/${row.id}`, { method: "PATCH", headers: { ...auth(ownerA), ...json }, body: JSON.stringify({ role: "staff" }) });
    expect(reset.status).toBe(200);
  });

  it("creates one sample org per person and removes it", async () => {
    const a = await app.request("/api/v1/orgs/sample", { method: "POST", headers: auth(staffA) });
    expect(a.status).toBe(201);
    const { id } = (await a.json()) as { id: string };
    const b = await app.request("/api/v1/orgs/sample", { method: "POST", headers: auth(staffA) });
    expect(((await b.json()) as { id: string }).id).toBe(id);

    const realDelete = await app.request(`/api/v1/orgs/${orgA}`, { method: "DELETE", headers: auth(ownerA) });
    expect(realDelete.status).toBe(403);
    const del = await app.request(`/api/v1/orgs/${id}`, { method: "DELETE", headers: auth(staffA) });
    expect(del.status).toBe(204);
  });
});
