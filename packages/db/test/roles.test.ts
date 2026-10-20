import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, asClaims, cleanup, createOrgWithTeam, errorCode, hasDb, makeDb, type TestOrg } from "./helpers";
import type { Db } from "../src";

describe.skipIf(!hasDb)("role and MFA matrix", () => {
  let db: Db;
  let a: TestOrg;

  beforeAll(async () => {
    db = makeDb();
    a = await createOrgWithTeam(db, "Role Org");
  });
  afterAll(async () => cleanup(db, [a]));

  it("board_viewer can see the org row but not the audit log", async () => {
    const orgs = await as(db, a.boardViewer, async (tx) => (await tx.execute(sql`select id from organizations`)).length);
    expect(orgs).toBe(1);
    const audit = await as(db, a.boardViewer, async (tx) => (await tx.execute(sql`select id from audit_log`)).length);
    expect(audit).toBe(0);
  });

  it("staff cannot invite members", async () => {
    const code = await errorCode(
      as(db, a.staff, (tx) =>
        tx.execute(sql`insert into org_memberships (org_id, invited_email, role) values (${a.id}, 'x@test.invalid', 'staff')`),
      ),
    );
    expect(code).toBe("42501");
  });

  it("admin without MFA cannot rename the org, with MFA can", async () => {
    const without = await as(db, a.admin, async (tx) => (await tx.execute(sql`update organizations set name = 'Nope' where id = ${a.id}`)).count, "aal1");
    expect(without).toBe(0);
    const withMfa = await as(db, a.admin, async (tx) => (await tx.execute(sql`update organizations set name = 'Renamed' where id = ${a.id}`)).count, "aal2");
    expect(withMfa).toBe(1);
  });

  it("nobody can promote themselves to owner through a plain update", async () => {
    // The row is visible to the admin, so the update is attempted and the with-check
    // clause rejects the new owner row with a permission error.
    const code = await errorCode(
      as(db, a.admin, (tx) => tx.execute(sql`update org_memberships set role = 'owner' where user_id = ${a.admin.id}`)),
    );
    expect(code).toBe("42501");
    const role = await as(db, a.admin, async (tx) => {
      const r = await tx.execute(sql`select role from org_memberships where user_id = ${a.admin.id}`);
      return (r[0] as { role: string }).role;
    });
    expect(role).toBe("admin");
  });

  it("only the owner can transfer ownership, and the event is recorded", async () => {
    const denied = await errorCode(as(db, a.admin, (tx) => tx.execute(sql`select app.transfer_ownership(${a.id}, ${a.admin.id}, 'test')`)));
    expect(denied).toBe("42501");

    await as(db, a.owner, (tx) => tx.execute(sql`select app.transfer_ownership(${a.id}, ${a.admin.id}, 'handing over')`));

    const roles = await as(db, a.admin, async (tx) => {
      const r = await tx.execute(sql`select user_id, role from org_memberships where org_id = ${a.id}`);
      return Object.fromEntries(r.map((x) => [(x as { user_id: string }).user_id, (x as { role: string }).role]));
    });
    expect(roles[a.admin.id]).toBe("owner");
    expect(roles[a.owner.id]).toBe("admin");

    const events = await as(db, a.admin, async (tx) => (await tx.execute(sql`select kind from ownership_events where org_id = ${a.id}`)).length);
    expect(events).toBe(1);
  });

  it("support override needs the support actor and a reason", async () => {
    const noReason = await errorCode(
      asClaims(db, { actor: "support", sub: a.staff.id, role: "authenticated", aal: "aal2" } as never, (tx) =>
        tx.execute(sql`select app.support_transfer_ownership(${a.id}, ${a.staff.id}, '')`),
      ),
    );
    expect(noReason).toBe("42501");
  });
});
