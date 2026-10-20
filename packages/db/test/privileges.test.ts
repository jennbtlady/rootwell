import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, asSystem, cleanup, createOrgWithTeam, errorCode, hasDb, makeDb, type TestOrg } from "./helpers";
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

  it("integration credentials stay with owners, admins, and that org's system actor", async () => {
    await asSystem(db, a.id, (tx) =>
      tx.execute(sql`insert into integrations (org_id, provider, status, account_id, credentials) values (${a.id}, 'mailchimp', 'connected', 'Acct', 'v1.secret')`),
    );
    expect(await as(db, a.owner, async (tx) => (await tx.execute(sql`select app.integration_credentials(${a.id}, 'mailchimp') as c`))[0])).toEqual({ c: "v1.secret" });
    expect(await asSystem(db, a.id, async (tx) => (await tx.execute(sql`select app.integration_credentials(${a.id}, 'mailchimp') as c`))[0])).toEqual({ c: "v1.secret" });
    expect(await errorCode(as(db, a.staff, (tx) => tx.execute(sql`select app.integration_credentials(${a.id}, 'mailchimp')`)))).toBe("42501");
    expect(await errorCode(as(db, b.owner, (tx) => tx.execute(sql`select app.integration_credentials(${a.id}, 'mailchimp')`)))).toBe("42501");
    expect(await errorCode(asSystem(db, b.id, (tx) => tx.execute(sql`select app.integration_credentials(${a.id}, 'mailchimp')`)))).toBe("42501");
    expect(await errorCode(withPublic(db, (tx) => tx.execute(sql`select app.integration_credentials(${a.id}, 'mailchimp')`)))).toBe("42501");
    // The column itself is not readable by signed-in roles, even the owner.
    expect(await errorCode(as(db, a.owner, (tx) => tx.execute(sql`select credentials from integrations`)))).toBe("42501");
    // Only the webhook receiver (signed out, after the signature check) maps accounts to orgs.
    expect(await errorCode(as(db, a.owner, (tx) => tx.execute(sql`select app.org_for_integration_account('mailchimp', 'Acct')`)))).toBe("42501");
    // Webhook rows are written only by the system actor for the same org.
    expect(await errorCode(as(db, a.owner, (tx) => tx.execute(sql`insert into webhook_events (org_id, provider, event_id, type) values (${a.id}, 'stripe', 'evt_x', 't')`)))).toBe("42501");
    expect(await errorCode(asSystem(db, b.id, (tx) => tx.execute(sql`insert into webhook_events (org_id, provider, event_id, type) values (${a.id}, 'stripe', 'evt_y', 't')`)))).toBe("42501");
  });
});
