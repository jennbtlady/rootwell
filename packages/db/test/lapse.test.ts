import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, asClaims, asSystem, cleanup, createOrgWithTeam, DATABASE_URL, errorCode, hasDb, makeDb, type TestOrg } from "./helpers";
import { schedulerClaims, type Db } from "../src";

/**
 * Lapsed accounts are deleted after 12 months with no activity, only after notices at
 * 60, 30 and 7 days, and at least 7 days after the last one. The database enforces all of it.
 */
describe.skipIf(!hasDb)("lapsed account deletion", () => {
  let db: Db;
  let a: TestOrg;
  let b: TestOrg;
  const sched = <T>(fn: Parameters<typeof asClaims<T>>[2]) => asClaims(db, schedulerClaims(), fn);
  const deleteOn = async (org: string) => ((await db.execute(sql`select app.org_delete_on(${org})::text as d`))[0] as { d: string | null }).d;
  /** Make an org look as if it lapsed `days` ago and has been quiet since (test setup, as the database owner). */
  /** Test setup as the database owner, with triggers off, on one connection. */
  const owner = (fn: (tx: postgres.TransactionSql) => Promise<unknown>) =>
    raw.begin(async (tx) => {
      await tx.unsafe("set local session_replication_role = replica");
      await fn(tx);
    });
  /** Make an org look as if it lapsed `days` ago and has been quiet since. */
  const lapse = (org: string, days: number) =>
    owner((tx) => tx`update organizations set subscription_status = 'canceled', read_only_until = now() - make_interval(days => ${days}) + interval '90 days',
                      last_activity_at = null, lapse_notices_sent = '{}', lapse_notices_for = null, lapse_final_notice_at = null,
                      created_at = now() - interval '3 years' where id = ${org}`);
  let raw: postgres.Sql;

  beforeAll(async () => {
    db = makeDb();
    raw = postgres(DATABASE_URL!, { max: 1, onnotice: () => {} });
    a = await createOrgWithTeam(db, "Lapse A");
    b = await createOrgWithTeam(db, "Lapse B");
  });
  afterAll(async () => {
    await raw.end();
    await cleanup(db, [a, b]);
  });

  it("only the scheduler can run the lapse functions, and it sees no rows directly", async () => {
    for (const q of [sql`select * from app.lapsed_orgs_due()`, sql`select app.record_lapse_notice(${a.id}, 60::smallint)`, sql`select app.delete_lapsed_org(${a.id})`]) {
      expect(await errorCode(as(db, a.owner, (tx) => tx.execute(q)))).toBe("42501");
      expect(await errorCode(asSystem(db, a.id, (tx) => tx.execute(q)))).toBe("42501");
    }
    expect(await as(db, a.owner, (tx) => tx.execute(sql`select * from app.lapse_notice_recipients(${a.id})`))).toHaveLength(0);
    const seen = await sched((tx) => tx.execute(sql`select count(*)::int as n from constituents`));
    expect((seen[0] as { n: number }).n).toBe(0);
    expect(await errorCode(as(db, a.owner, (tx) => tx.execute(sql`update organizations set last_activity_at = now() + interval '5 years' where id = ${a.id}`)))).toBe("42501");
  });

  it("an active or paying account has no deletion date", async () => {
    expect(await deleteOn(a.id)).toBeNull();
  });

  it("a quiet lapsed account is due 12 months after it lapsed, and activity resets the clock", async () => {
    await lapse(a.id, 320);
    const d = await deleteOn(a.id);
    expect(Math.round((new Date(d!).getTime() - Date.now()) / 86400_000)).toBe(45);
    // A team member uses the account: the clock restarts from today.
    await as(db, a.staff, (tx) => tx.execute(sql`select app.touch_org_activity(${a.id})`));
    expect(Math.round((new Date((await deleteOn(a.id))!).getTime() - Date.now()) / 86400_000)).toBeGreaterThan(360);
    // Someone from another organization cannot keep it alive.
    await lapse(a.id, 320);
    await as(db, b.owner, (tx) => tx.execute(sql`select app.touch_org_activity(${a.id})`));
    expect(Math.round((new Date((await deleteOn(a.id))!).getTime() - Date.now()) / 86400_000)).toBe(45);
  });

  it("deletes only after all three notices and 7 days after the last one", async () => {
    await lapse(a.id, 380);
    const due = await sched((tx) => tx.execute(sql`select * from app.lapsed_orgs_due()`));
    expect(due.map((r) => (r as { org_id: string }).org_id)).toContain(a.id);
    // No notices yet: refused.
    expect(((await sched((tx) => tx.execute(sql`select app.delete_lapsed_org(${a.id}) as ok`)))[0] as { ok: boolean }).ok).toBe(false);
    // The late 7-day notice covers 60 and 30 too, but deletion must still wait 7 days.
    await sched((tx) => tx.execute(sql`select app.record_lapse_notice(${a.id}, 7::smallint)`));
    const sent = (await db.execute(sql`select lapse_notices_sent from organizations where id = ${a.id}`))[0] as { lapse_notices_sent: number[] };
    expect([...sent.lapse_notices_sent].sort((x, y) => x - y)).toEqual([7, 30, 60]);
    expect(((await sched((tx) => tx.execute(sql`select app.delete_lapsed_org(${a.id}) as ok`)))[0] as { ok: boolean }).ok).toBe(false);
    await owner(async (tx) => {
      await tx`update organizations set lapse_final_notice_at = now() - interval '8 days' where id = ${a.id}`;
      await tx`insert into constituents (org_id, type, last_name, display_name, sort_name) values (${a.id}, 'person', 'Okafor', 'Okafor', 'Okafor')`;
    });
    expect(((await sched((tx) => tx.execute(sql`select app.delete_lapsed_org(${a.id}) as ok`)))[0] as { ok: boolean }).ok).toBe(true);
    expect(await db.execute(sql`select 1 from organizations where id = ${a.id}`)).toHaveLength(0);
    expect(await db.execute(sql`select 1 from constituents where org_id = ${a.id}`)).toHaveLength(0);
    const note = (await db.execute(sql`select name, members_notified, notices_sent from deleted_organizations where former_org_id = ${a.id}`))[0] as { name: string; members_notified: number };
    expect(note).toMatchObject({ name: "Lapse A", members_notified: 4 });
    // Nobody signed in can read the deletion notes.
    expect(await as(db, b.owner, (tx) => tx.execute(sql`select * from deleted_organizations`))).toHaveLength(0);
  });

  it("never deletes a paying account, even with old notices", async () => {
    await lapse(b.id, 400);
    await sched((tx) => tx.execute(sql`select app.record_lapse_notice(${b.id}, 7::smallint)`));
    await owner((tx) => tx`update organizations set lapse_final_notice_at = now() - interval '30 days', subscription_status = 'active' where id = ${b.id}`);
    expect(((await sched((tx) => tx.execute(sql`select app.delete_lapsed_org(${b.id}) as ok`)))[0] as { ok: boolean }).ok).toBe(false);
    expect(await db.execute(sql`select 1 from organizations where id = ${b.id}`)).toHaveLength(1);
  });
});
