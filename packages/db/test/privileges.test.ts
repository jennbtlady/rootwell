import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, cleanup, createOrgWithTeam, errorCode, hasDb, makeDb, type TestOrg } from "./helpers";
import { withPublic, type Db } from "../src";

/** The `app` functions are the security boundary: check who can call what. */
describe.skipIf(!hasDb)("function privileges", () => {
  let db: Db;
  let a: TestOrg;
  let b: TestOrg;

  beforeAll(async () => {
    db = makeDb();
    a = await createOrgWithTeam(db, "Priv A");
    b = await createOrgWithTeam(db, "Priv B");
  });
  afterAll(async () => cleanup(db, [a, b]));

  it("a signed-in user cannot seed demo data into another organization", async () => {
    expect(await errorCode(as(db, a.owner, (tx) => tx.execute(sql`select app.seed_sample_data(${b.id})`)))).toBe("42501");
    const n = await db.execute(sql`select count(*)::int as n from constituents where org_id = ${b.id}`);
    expect((n[0] as { n: number }).n).toBe(0);
  });

  it("a signed-out visitor can call only the board link function", async () => {
    expect(await withPublic(db, async (tx) => (await tx.execute(sql`select app.board_view('nope') as v`))[0])).toEqual({ v: null });
    for (const q of [
      sql`select app.create_organization('x')`,
      sql`select app.scan_duplicates(${a.id})`,
      sql`select app.refresh_dashboard(${a.id})`,
      sql`select app.seed_sample_data(${a.id})`,
      sql`select * from app.search_constituents(${a.id}, 'a')`,
    ]) {
      expect(await errorCode(withPublic(db, (tx) => tx.execute(q)))).toBe("42501");
    }
    for (const t of ["organizations", "constituents", "gifts", "dashboard_snapshots", "board_share_links"]) {
      const code = await errorCode(withPublic(db, (tx) => tx.execute(sql`select 1 from ${sql.identifier(t)} limit 1`)));
      const rows = code ? 0 : (await withPublic(db, (tx) => tx.execute(sql`select 1 from ${sql.identifier(t)} limit 1`))).length;
      expect(rows, t).toBe(0);
    }
  });
});
