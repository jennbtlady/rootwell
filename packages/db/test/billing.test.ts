import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, asSystem, cleanup, createAuthUser, createOrgWithTeam, errorCode, hasDb, makeDb, type TestOrg } from "./helpers";
import { withPublic, type Db } from "../src";

/**
 * Billing state and read-only access. A lapsed organization can read everything and
 * change nothing in its donor and gift data; the database enforces it.
 */
describe.skipIf(!hasDb)("billing and read-only access", () => {
  let db: Db;
  let a: TestOrg;
  let fund = "";
  let person = "";

  const setBilling = (status: string, trialEndsSql = sql`trial_ends_at`) =>
    asSystem(db, a.id, (tx) => tx.execute(sql`update organizations set subscription_status = ${status}, trial_ends_at = ${trialEndsSql} where id = ${a.id}`));
  const writable = async () => ((await as(db, a.owner, (tx) => tx.execute(sql`select app.org_writable(${a.id}) as w`)))[0] as { w: boolean }).w;

  beforeAll(async () => {
    db = makeDb();
    a = await createOrgWithTeam(db, "Billing A");
    await as(db, a.owner, async (tx) => {
      fund = ((await tx.execute(sql`insert into funds (org_id, name) values (${a.id}, 'General') returning id`))[0] as { id: string }).id;
      person = ((await tx.execute(sql`insert into constituents (org_id, type, last_name) values (${a.id}, 'person', 'Okafor') returning id`))[0] as { id: string }).id;
    });
  });
  afterAll(async () => cleanup(db, [a]));

  it("a new organization starts a 30-day trial and can change its data", async () => {
    const r = (await as(db, a.owner, (tx) => tx.execute(sql`select subscription_status, extract(day from trial_ends_at - now())::int as days from organizations where id = ${a.id}`)))[0] as { subscription_status: string; days: number };
    expect(r.subscription_status).toBe("trialing");
    expect(r.days).toBeGreaterThanOrEqual(29);
    expect(await writable()).toBe(true);
  });

  it("owners cannot change billing fields or the sample flag themselves", async () => {
    for (const set of [sql`subscription_status = 'active'`, sql`trial_ends_at = now() + interval '10 years'`, sql`read_only_until = now() + interval '1 year'`, sql`sample_org_enabled = true`, sql`stripe_customer_id = 'cus_fake'`]) {
      expect(await errorCode(as(db, a.owner, (tx) => tx.execute(sql`update organizations set ${set} where id = ${a.id}`)))).toBe("42501");
    }
    // Ordinary settings still save.
    await as(db, a.owner, (tx) => tx.execute(sql`update organizations set name = 'Billing A renamed' where id = ${a.id}`));
  });

  it("after the trial ends without a subscription, data is read only", async () => {
    await setBilling("trialing", sql`now() - interval '1 day'`);
    expect(await writable()).toBe(false);
    await expectReadOnly();
  });

  it("an active subscription can change data, and so can past due while Stripe retries", async () => {
    await setBilling("active");
    expect(await writable()).toBe(true);
    await as(db, a.staff, (tx) => tx.execute(sql`insert into interactions (org_id, constituent_id, type, occurred_on, summary) values (${a.id}, ${person}, 'call', current_date, 'Thanked for gift')`));
    await setBilling("past_due");
    expect(await writable()).toBe(true);
  });

  it("a canceled subscription is read only, but the account can still be handed over and restarted", async () => {
    await setBilling("canceled");
    await expectReadOnly();
    // Reads still work for everyone.
    const n = (await as(db, a.staff, (tx) => tx.execute(sql`select count(*)::int as n from constituents where org_id = ${a.id}`)))[0] as { n: number };
    expect(n.n).toBe(1);
    // Membership changes and settings still work, so a new owner can take over.
    const newcomer = await createAuthUser(db, "newcomer");
    await as(db, a.owner, (tx) => tx.execute(sql`insert into org_memberships (org_id, user_id, role, status, accepted_at) values (${a.id}, ${newcomer.id}, 'admin', 'active', now())`));
    // A Stripe gift paid before the lapse is still recorded by the system actor.
    await asSystem(db, a.id, (tx) => tx.execute(sql`insert into gifts (org_id, constituent_id, amount, gift_date, fund_id, payment_method, external_source, external_id) values (${a.id}, ${person}, 20, current_date, ${fund}, 'card', 'stripe', 'ch_before_lapse')`));
    await setBilling("active");
    expect(await writable()).toBe(true);
  });

  it("the public giving page stops offering Stripe while read only", async () => {
    const slug = `bill-${a.id.slice(0, 8)}`;
    await as(db, a.owner, (tx) => tx.execute(sql`insert into donation_pages (org_id, slug, title) values (${a.id}, ${slug}, 'Give')`));
    await asSystem(db, a.id, (tx) => tx.execute(sql`insert into integrations (org_id, provider, status, account_id) values (${a.id}, 'stripe', 'connected', 'acct_bill')`));
    const page = async () => ((await withPublic(db, (tx) => tx.execute(sql`select app.public_donation_page(${slug}) as p`)))[0] as { p: { stripeAccount: string | null } }).p;
    expect((await page()).stripeAccount).toBe("acct_bill");
    await setBilling("unpaid");
    expect((await page()).stripeAccount).toBeNull();
    await setBilling("active");
  });

  it("the sample organization is never read only", async () => {
    const owner = await createAuthUser(db, "sample-owner");
    const sampleId = ((await as(db, owner, (tx) => tx.execute(sql`select app.create_sample_org() as id`)))[0] as { id: string }).id;
    await asSystem(db, sampleId, (tx) => tx.execute(sql`update organizations set subscription_status = 'canceled' where id = ${sampleId}`));
    expect(((await as(db, owner, (tx) => tx.execute(sql`select app.org_writable(${sampleId}) as w`)))[0] as { w: boolean }).w).toBe(true);
    await db.execute(sql`delete from organizations where id = ${sampleId}`);
    await db.execute(sql`delete from auth.users where id = ${owner.id}`);
  });

  async function expectReadOnly() {
    expect(await writable()).toBe(false);
    for (const [who, q] of [
      [a.owner, sql`insert into constituents (org_id, type, last_name) values (${a.id}, 'person', 'Blocked')`],
      [a.staff, sql`insert into gifts (org_id, constituent_id, amount, gift_date, fund_id, payment_method) values (${a.id}, ${person}, 5, current_date, ${fund}, 'cash')`],
      [a.admin, sql`insert into funds (org_id, name) values (${a.id}, 'Blocked fund')`],
    ] as const) {
      expect(await errorCode(as(db, who, (tx) => tx.execute(q)))).toBe("42501");
    }
    // Updates and deletes match no rows instead of changing anything.
    const upd = await as(db, a.owner, (tx) => tx.execute(sql`update constituents set last_name = 'Changed' where id = ${person}`));
    expect(upd.count).toBe(0);
    const del = await as(db, a.owner, (tx) => tx.execute(sql`delete from funds where id = ${fund}`));
    expect(del.count).toBe(0);
  }
});
