import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@maple/db";
import { app, setDb, setMailer, setVerifier, type Mail } from "../src";

const DATABASE_URL = process.env.DATABASE_URL;
type U = { id: string; email: string };
const json = { "content-type": "application/json" };

async function createUser(db: Db, label: string): Promise<U> {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@test.invalid`;
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${email}, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())`);
  return { id, email };
}

/** The daily job for lapsed accounts: notices to the whole team, then deletion at 12 months. */
describe.skipIf(!DATABASE_URL)("lapsed accounts job", () => {
  let db: Db;
  let raw: postgres.Sql;
  let owner: U;
  let staff: U;
  let orgId = "";
  const sent: Mail[] = [];
  const SECRET = "test-cron-secret-123";
  const run = () => app.request("/api/v1/cron/lapsed-accounts", { headers: { authorization: `Bearer ${SECRET}` } });
  /** Test setup as the database owner, triggers off. */
  const set = (q: (tx: postgres.TransactionSql) => Promise<unknown>) =>
    raw.begin(async (tx) => {
      await tx.unsafe("set local session_replication_role = replica");
      await q(tx);
    });
  /** Lapsed `days` ago and quiet since: 365 - days left until deletion. */
  const lapsedDaysAgo = (days: number) =>
    set((tx) => tx`update organizations set subscription_status = 'canceled', read_only_until = now() - make_interval(days => ${days}) + interval '90 days',
                   last_activity_at = null, created_at = now() - interval '3 years' where id = ${orgId}`);

  beforeAll(async () => {
    process.env.CRON_SECRET = SECRET;
    db = createDb(DATABASE_URL);
    raw = postgres(DATABASE_URL!, { max: 1, onnotice: () => {} });
    setDb(db);
    setVerifier(async (token) => {
      const [, sub, aal] = token.split(":");
      return { sub, aal };
    });
    setMailer({ from: "test", send: async (m) => void sent.push(m) });
    owner = await createUser(db, "lapse-owner");
    staff = await createUser(db, "lapse-staff");
    orgId = ((await (await app.request("/api/v1/orgs", { method: "POST", headers: { authorization: `Bearer token:${owner.id}:aal2`, ...json }, body: JSON.stringify({ name: "Hillside Reading Club" }) })).json()) as { id: string }).id;
    await db.execute(sql`insert into org_memberships (org_id, user_id, role, status, accepted_at) values (${orgId}, ${staff.id}, 'staff', 'active', now())`);
  });
  afterAll(async () => {
    await raw`delete from organizations where id = ${orgId}`;
    await raw`delete from deleted_organizations where former_org_id = ${orgId}`;
    for (const u of [owner, staff]) await raw`delete from auth.users where id = ${u.id}`;
    await raw.end();
    setVerifier(undefined);
    setDb(undefined);
  });

  it("refuses to run without the secret", async () => {
    expect((await app.request("/api/v1/cron/lapsed-accounts")).status).toBe(401);
    expect((await app.request("/api/v1/cron/lapsed-accounts", { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
  });

  it("does nothing for an active account", async () => {
    const r = await run();
    expect(r.status).toBe(200);
    expect(sent.filter((m) => m.subject.includes("Hillside"))).toHaveLength(0);
  });

  it("emails the whole team once at 60 days, then at 30, then at 7", async () => {
    await lapsedDaysAgo(305); // 60 days left
    await run();
    await run(); // a second run the same day sends nothing new
    const first = sent.filter((m) => m.subject.includes("Hillside"));
    expect(first.map((m) => m.to).sort()).toEqual([owner.email, staff.email].sort());
    expect(first[0]!.subject).toMatch(/will be deleted on/);
    expect(first[0]!.text).toContain("in 60 days");
    expect(first[0]!.text).toContain(`/app/orgs/${orgId}/settings/account`);

    await lapsedDaysAgo(336); // 29 days left
    await run();
    await lapsedDaysAgo(359); // 6 days left
    await run();
    const all = sent.filter((m) => m.subject.includes("Hillside"));
    expect(all).toHaveLength(6);
    expect(all.slice(-1)[0]!.text).toMatch(/in [67] days/);
  });

  it("a team member using the account resets the clock", async () => {
    const before = ((await raw`select app.org_delete_on(${orgId})::text as d`)[0] as { d: string }).d;
    const r = await app.request(`/api/v1/orgs/${orgId}/constituents`, { headers: { authorization: `Bearer token:${staff.id}:aal2` } });
    expect(r.status).toBe(200);
    const after = ((await raw`select app.org_delete_on(${orgId})::text as d`)[0] as { d: string }).d;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime() + 300 * 86400_000);
  });

  it("deletes the account only when time is up and the last notice is a week old", async () => {
    await lapsedDaysAgo(370); // past due; notices were cleared by the new activity
    sent.length = 0;
    await run();
    expect(sent.filter((m) => m.subject.includes("Hillside")).length).toBe(2); // a late 7-day notice
    expect(sent[0]!.text).toContain("in 7 days");
    expect(await raw`select 1 from organizations where id = ${orgId}`).toHaveLength(1);

    await set((tx) => tx`update organizations set lapse_final_notice_at = now() - interval '8 days' where id = ${orgId}`);
    const r = (await (await run()).json()) as { deleted: number };
    expect(r.deleted).toBe(1);
    expect(await raw`select 1 from organizations where id = ${orgId}`).toHaveLength(0);
    expect(await raw`select 1 from org_memberships where org_id = ${orgId}`).toHaveLength(0);
    const note = (await raw`select name, members_notified from deleted_organizations where former_org_id = ${orgId}`)[0];
    expect(note).toMatchObject({ name: "Hillside Reading Club", members_notified: 2 });
  });
});
