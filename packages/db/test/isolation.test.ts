import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, asSystem, cleanup, createOrgWithTeam, errorCode, hasDb, makeDb, tenantTables, type TestOrg } from "./helpers";
import type { Db } from "../src";

/**
 * Cross-tenant isolation. Every tenant table is covered automatically because the
 * table list is read from the database. Postgres reports a row that RLS hides as
 * "0 rows", not as an error, so most assertions are on counts.
 */
describe.skipIf(!hasDb)("tenant isolation", () => {
  let db: Db;
  let a: TestOrg;
  let b: TestOrg;
  let tables: string[] = [];

  beforeAll(async () => {
    db = makeDb();
    a = await createOrgWithTeam(db, "Org A");
    b = await createOrgWithTeam(db, "Org B");
    tables = await tenantTables(db);
    expect(tables).toContain("org_memberships");
  });

  afterAll(async () => {
    await cleanup(db, [a, b]);
  });

  it("org A's owner sees only org A", async () => {
    const ids = await as(db, a.owner, async (tx) => {
      const r = await tx.execute(sql`select id from organizations order by name`);
      return r.map((x) => (x as { id: string }).id);
    });
    expect(ids).toEqual([a.id]);
  });

  it("every tenant table hides org B rows from org A users", async () => {
    for (const t of tables) {
      const n = await as(db, a.owner, async (tx) => {
        const r = await tx.execute(sql`select count(*)::int as n from ${sql.identifier(t)} where org_id = ${b.id}`);
        return (r[0] as { n: number }).n;
      });
      expect(n, `table ${t}`).toBe(0);
    }
  });

  it("org A's admin cannot insert a membership into org B", async () => {
    const code = await errorCode(
      as(db, a.admin, (tx) =>
        tx.execute(sql`
          insert into org_memberships (org_id, user_id, role, status)
          values (${b.id}, ${a.staff.id}, 'staff', 'active')
        `),
      ),
    );
    expect(code).toBe("42501");
  });

  it("org A's admin updating an org B membership affects zero rows", async () => {
    const n = await as(db, a.admin, async (tx) => {
      const r = await tx.execute(sql`
        update org_memberships set status = 'suspended'
         where org_id = ${b.id} and user_id = ${b.staff.id}
      `);
      return r.count;
    });
    expect(n).toBe(0);
    const still = await as(db, b.owner, async (tx) => {
      const r = await tx.execute(sql`select status from org_memberships where user_id = ${b.staff.id}`);
      return (r[0] as { status: string }).status;
    });
    expect(still).toBe("active");
  });

  it("a system job scoped to org A cannot see org B", async () => {
    const seen = await asSystem(db, a.id, async (tx) => {
      const r = await tx.execute(sql`select id from organizations`);
      return r.map((x) => (x as { id: string }).id);
    });
    expect(seen).toEqual([a.id]);
  });

  it("the audit log recorded org creation and membership inserts with the right org", async () => {
    const rows = await as(db, a.owner, async (tx) => {
      const r = await tx.execute(sql`select table_name, action, org_id from audit_log order by id`);
      return r as unknown as { table_name: string; action: string; org_id: string }[];
    });
    expect(rows.every((r) => r.org_id === a.id)).toBe(true);
    expect(rows.some((r) => r.table_name === "organizations" && r.action === "insert")).toBe(true);
    expect(rows.filter((r) => r.table_name === "org_memberships" && r.action === "insert").length).toBe(4);
  });
});
