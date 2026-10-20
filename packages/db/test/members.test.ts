import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, cleanup, createAuthUser, createOrgWithTeam, errorCode, hasDb, makeDb, type TestOrg, type TestUser } from "./helpers";
import type { Db } from "../src";

describe.skipIf(!hasDb)("invitations", () => {
  let db: Db;
  let a: TestOrg;
  let b: TestOrg;
  const extraUsers: TestUser[] = [];

  beforeAll(async () => {
    db = makeDb();
    a = await createOrgWithTeam(db, "Invite Org A");
    b = await createOrgWithTeam(db, "Invite Org B");
  });
  afterAll(async () => {
    for (const u of extraUsers) await db.execute(sql`delete from auth.users where id = ${u.id}`);
    await cleanup(db, [a, b]);
  });

  it("staff cannot invite, admins can, and the owner role is never grantable", async () => {
    expect(await errorCode(as(db, a.staff, (tx) => tx.execute(sql`select * from app.invite_member(${a.id}, 'x@test.invalid', 'staff')`)))).toBe("42501");
    expect(await errorCode(as(db, a.admin, (tx) => tx.execute(sql`select * from app.invite_member(${a.id}, 'x@test.invalid', 'owner')`)))).toBe("22023");
    expect(await errorCode(as(db, a.admin, (tx) => tx.execute(sql`select * from app.invite_member(${a.id}, 'x@test.invalid', 'staff')`), "aal1"))).toBe("42501");
  });

  it("an admin of org A cannot invite into org B", async () => {
    expect(await errorCode(as(db, a.admin, (tx) => tx.execute(sql`select * from app.invite_member(${b.id}, 'x@test.invalid', 'staff')`)))).toBe("42501");
  });

  it("a brand new email gets an invited row that goes live on first sign-in", async () => {
    const email = `new-${randomUUID().slice(0, 8)}@test.invalid`;
    const row = await as(db, a.admin, async (tx) => (await tx.execute(sql`select * from app.invite_member(${a.id}, ${email.toUpperCase()}, 'staff')`))[0] as { membership_id: string; membership_status: string });
    expect(row.membership_status).toBe("invited");

    // Inviting the same email twice is refused.
    expect(await errorCode(as(db, a.admin, (tx) => tx.execute(sql`select * from app.invite_member(${a.id}, ${email}, 'staff')`)))).toBe("23505");

    // Supabase creates the auth user when it sends the invite. The trigger links it.
    const user = await createAuthUser(db, "invitee", email);
    extraUsers.push(user);
    let m = await as(db, a.admin, async (tx) => (await tx.execute(sql`select user_id, status from org_memberships where id = ${row.membership_id}`))[0] as { user_id: string; status: string });
    expect(m.user_id).toBe(user.id);
    expect(m.status).toBe("invited");

    // First sign-in activates it.
    await db.execute(sql`update auth.users set last_sign_in_at = now() where id = ${user.id}`);
    m = await as(db, a.admin, async (tx) => (await tx.execute(sql`select user_id, status from org_memberships where id = ${row.membership_id}`))[0] as { user_id: string; status: string });
    expect(m.status).toBe("active");
  });

  it("an existing account is added as an active member right away", async () => {
    const row = await as(db, a.owner, async (tx) => (await tx.execute(sql`select * from app.invite_member(${a.id}, ${b.staff.email}, 'board_viewer')`))[0] as { membership_status: string });
    expect(row.membership_status).toBe("active");
    expect(await errorCode(as(db, a.owner, (tx) => tx.execute(sql`select * from app.invite_member(${a.id}, ${b.staff.email}, 'staff')`)))).toBe("23505");
    // B's staff member now sees both orgs, and nothing else.
    const seen = await as(db, b.staff, async (tx) => (await tx.execute(sql`select id from organizations`)).length);
    expect(seen).toBe(2);
  });
});

describe.skipIf(!hasDb)("sample organization", () => {
  let db: Db;
  let a: TestOrg;

  beforeAll(async () => {
    db = makeDb();
    a = await createOrgWithTeam(db, "Sample Test Org");
  });
  afterAll(async () => cleanup(db, [a]));

  it("is created once per person and can be removed only by its owner", async () => {
    const first = await as(db, a.staff, async (tx) => (await tx.execute(sql`select app.create_sample_org() as id`))[0] as { id: string }, "aal1");
    const second = await as(db, a.staff, async (tx) => (await tx.execute(sql`select app.create_sample_org() as id`))[0] as { id: string }, "aal1");
    expect(second.id).toBe(first.id);

    const org = await as(db, a.staff, async (tx) => (await tx.execute(sql`select name, sample_org_enabled from organizations where id = ${first.id}`))[0] as { name: string; sample_org_enabled: boolean });
    expect(org.sample_org_enabled).toBe(true);
    expect(org.name).toMatch(/demo/i);

    // A real org cannot be deleted through this door, and others cannot delete the sample.
    expect(await errorCode(as(db, a.owner, (tx) => tx.execute(sql`select app.delete_sample_org(${a.id})`)))).toBe("42501");
    expect(await errorCode(as(db, a.owner, (tx) => tx.execute(sql`select app.delete_sample_org(${first.id})`)))).toBe("42501");

    await as(db, a.staff, (tx) => tx.execute(sql`select app.delete_sample_org(${first.id})`));
    const left = await as(db, a.staff, async (tx) => (await tx.execute(sql`select id from organizations where id = ${first.id}`)).length);
    expect(left).toBe(0);
  });
});
