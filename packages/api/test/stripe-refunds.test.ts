import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, userClaims, withRls, type Db } from "@maple/db";
import { app, setDb, setVerifier } from "../src";
import { SimulatedStripeGateway, setStripeGateway } from "../src/integrations";

/**
 * Fundraising Phase 2: refunds and disputes. A refund never changes the gift. It adds a
 * negative entry on the refund date that points back at the gift, so totals net out and the
 * deposit it comes out of still adds up. Disputes show on Data Health; a lost one is reversed
 * the same way.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const json = { "content-type": "application/json" };
const form = { "content-type": "application/x-www-form-urlencoded" };

type Row = { id: string; amount: string; gift_type: string; reverses_gift_id: string | null; external_id: string; fund_id: string | null; batch_id: string | null; acknowledged_at: string | null; deductible_amount: string | null };

describe.skipIf(!DATABASE_URL)("refunds and disputes", () => {
  let db: Db;
  const owner = { id: randomUUID(), email: `refund-owner-${randomUUID().slice(0, 8)}@test.invalid` };
  let orgId = "";
  let fundId = "";
  let accountId = "";
  const slug = `refunds-${randomUUID().slice(0, 8)}`;
  const h = { authorization: `Bearer token:${owner.id}:aal2`, ...json };
  const call = (method: string, path: string, body?: unknown) => app.request(`/api/v1/orgs/${orgId}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const statuses: number[] = [];
  const gw = new SimulatedStripeGateway("whsec_test_refunds", () => "http://localhost:3000", async (body, signature) => {
    const r = await app.request("/api/v1/webhooks/stripe", { method: "POST", headers: { ...json, "stripe-signature": signature }, body });
    statuses.push(r.status);
  });
  const as = <T>(f: (tx: Parameters<Parameters<typeof withRls>[2]>[0]) => Promise<T>) => withRls(db, userClaims(owner.id, "aal2"), f);
  const gifts = (email: string) =>
    as((tx) =>
      tx.execute(sql`
        select g.id, g.amount::text, g.gift_type, g.reverses_gift_id, g.external_id, g.fund_id, g.batch_id, g.acknowledged_at, g.deductible_amount::text
          from gifts g join constituent_emails e on e.constituent_id = g.constituent_id
         where g.org_id = ${orgId} and e.email = ${email} order by g.created_at`),
    ) as Promise<Row[]>;
  const attention = async () => ((await (await call("GET", "/integrations/health")).json()) as { needsAttention: { type: string; outcome: string }[] }).needsAttention;

  async function give(amount: number, name: string, email: string, postal = "04330") {
    const r = await app.request(`/api/v1/public/give/${slug}/checkout`, { method: "POST", headers: { ...json, "x-forwarded-for": `198.51.100.${randomUUID()}` }, body: JSON.stringify({ amount, fundId }) });
    expect(r.status).toBe(200);
    const path = new URL(((await r.json()) as { url: string }).url).pathname;
    const pay = await app.request(path, { method: "POST", headers: form, body: new URLSearchParams({ name, email, line1: "1 Main St", city: "Augusta", state: "ME", postal }).toString() });
    expect(pay.status).toBe(303);
  }

  beforeAll(async () => {
    process.env.INTEGRATIONS_KEY ??= randomBytes(32).toString("base64");
    db = createDb(DATABASE_URL);
    setDb(db);
    setVerifier(async (token) => {
      const [, sub, aal] = token.split(":");
      return { sub, aal };
    });
    setStripeGateway(gw);
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (${owner.id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${owner.email}, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())`);
    orgId = ((await (await app.request("/api/v1/orgs", { method: "POST", headers: h, body: JSON.stringify({ name: "Kennebec Refund Shelter" }) })).json()) as { id: string }).id;
    fundId = ((await (await call("POST", "/coding/funds", { name: "Animal care" })).json()) as { id: string }).id;
    const start = new URL(((await (await call("POST", "/integrations/stripe/connect")).json()) as { url: string }).url);
    const approve = await app.request("/api/v1/stripe-sim/connect", { method: "POST", headers: form, body: new URLSearchParams({ state: start.searchParams.get("state")!, redirect_uri: start.searchParams.get("redirect_uri")! }).toString() });
    const back = new URL(approve.headers.get("location")!);
    accountId = ((await (await call("POST", "/integrations/stripe/complete", { code: back.searchParams.get("code"), state: back.searchParams.get("state") })).json()) as { accountId: string }).accountId;
    expect((await call("POST", "/donation-pages", { slug, title: "Help the animals", fundIds: [fundId] })).status).toBe(201);
  });

  afterAll(async () => {
    await db.execute(sql`delete from organizations where id = ${orgId}`);
    await db.execute(sql`delete from auth.users where id = ${owner.id}`);
    setStripeGateway(undefined);
    setVerifier(undefined);
    setDb(undefined);
  });

  it("a partial refund, then the rest, add two reversing entries and leave the gift alone", async () => {
    await give(100, "Avery Moss", "avery.moss@example.org");
    const [gift] = await gifts("avery.moss@example.org");
    expect(gift).toMatchObject({ amount: "100.00", gift_type: "one_time" });

    await gw.refund(accountId, gift!.external_id, 3000);
    await gw.refund(accountId, gift!.external_id);
    const rows = await gifts("avery.moss@example.org");
    expect(rows.map((r) => [r.amount, r.gift_type, r.reverses_gift_id])).toEqual([
      ["100.00", "one_time", null],
      ["-30.00", "refund", gift!.id],
      ["-70.00", "refund", gift!.id],
    ]);
    // Same fund, already "thanked" (a refund needs no note), deductible part taken back.
    for (const r of rows.slice(1)) {
      expect(r.fund_id).toBe(fundId);
      expect(r.acknowledged_at).not.toBeNull();
      expect(r.external_id).toMatch(/^re_/);
      expect(r.deductible_amount).toBe(r.amount);
    }
    await expect(gw.refund(accountId, gift!.external_id)).rejects.toThrow(/Nothing left/);

    // Refunds are not "needs attention": the books take care of themselves.
    expect((await attention()).filter((a) => a.type === "charge.refunded")).toEqual([]);
    expect(statuses.every((s) => s === 200)).toBe(true);
  });

  it("replaying a refund event makes no second entry", async () => {
    const sent = (globalThis as unknown as { __mapleStripeSim: { sent: { type: string }[] } }).__mapleStripeSim.sent;
    const last = [...sent].reverse().find((e) => e.type === "charge.refunded")!;
    const body = JSON.stringify({ ...last, id: `evt_replay_${randomUUID()}` });
    const { default: Stripe } = await import("stripe");
    const sig = new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload: body, secret: "whsec_test_refunds" });
    expect((await app.request("/api/v1/webhooks/stripe", { method: "POST", headers: { ...json, "stripe-signature": sig }, body })).status).toBe(200);
    expect(await gifts("avery.moss@example.org")).toHaveLength(3);
  });

  it("the deposit batch holds the gift and its refunds, and adds up", async () => {
    const r = await call("POST", "/integrations/stripe/simulate-payout");
    expect(r.status).toBe(200);
    const { amount: netCents } = (await r.json()) as { amount: number };
    const batch = ((await (await call("GET", "/batches?status=open")).json()) as { items: { id: string; expectedTotal: string; expectedCount: number }[] }).items[0]!;
    const rows = await gifts("avery.moss@example.org");
    expect(rows.every((g) => g.batch_id === batch.id)).toBe(true);
    expect(batch.expectedTotal).toBe("0.00");
    expect(batch.expectedCount).toBe(3);
    // The bank gets the gift less its fee less the refunds: Stripe keeps the fee.
    expect(netCents).toBeLessThan(0);
    expect((await call("POST", `/batches/${batch.id}/post`)).status).toBe(200);

    // A refund entry is not a gift: the fund report counts one gift and nets to zero.
    const rep = (await (await call("GET", "/reports/gifts_by_fund?from=2000-01-01")).json()) as { rows: { fund: string; gifts: number; donors: number; total: string }[] };
    expect(rep.rows.find((x) => x.fund === "Animal care")).toMatchObject({ gifts: 1, donors: 1, total: "0.00" });
  });

  it("a disputed gift shows on Data Health; a lost dispute is reversed, a won one is not", async () => {
    await give(50, "Blair Ortiz", "blair.ortiz@example.org");
    await give(40, "Casey Ng", "casey.ng@example.org");
    const [lost] = await gifts("blair.ortiz@example.org");
    const [won] = await gifts("casey.ng@example.org");

    const d1 = await gw.dispute(accountId, lost!.external_id);
    const d2 = await gw.dispute(accountId, won!.external_id);
    const open = (await attention()).filter((a) => a.type === "charge.dispute.created");
    expect(open).toHaveLength(2);
    expect(open[0]!.outcome).toMatch(/answer in Stripe by/);

    await gw.closeDispute(d1, false);
    await gw.closeDispute(d2, true);
    expect((await gifts("blair.ortiz@example.org")).map((r) => [r.amount, r.gift_type, r.external_id])).toEqual([
      ["50.00", "one_time", lost!.external_id],
      ["-50.00", "refund", d1],
    ]);
    expect(await gifts("casey.ng@example.org")).toHaveLength(1);
    expect((await attention()).some((a) => a.type === "charge.dispute.closed" && /dispute fee/.test(a.outcome))).toBe(true);

    // The lost dispute and its fee come out of the next deposit.
    await call("POST", "/integrations/stripe/simulate-payout");
    const batch = ((await (await call("GET", "/batches?status=open")).json()) as { items: { id: string; expectedTotal: string }[] }).items[0]!;
    expect(batch.expectedTotal).toBe("40.00");
  });

  it("an unsure donor match makes a new record and flags it for review", async () => {
    // Same name and address: a confident match, so no new record.
    await give(10, "Avery Moss", "avery.m@example.org");
    // Same name, but a new email and another town: maybe the same person, maybe not.
    await give(25, "Avery Moss", "a.moss.home@example.org", "04901");
    const people = (await as((tx) => tx.execute(sql`select id from constituents where org_id = ${orgId} and last_name = 'Moss'`))) as { id: string }[];
    expect(people).toHaveLength(2);
    const review = await as((tx) => tx.execute(sql`select status from duplicate_candidates where org_id = ${orgId} and a_id = any(${sql.raw(`array['${people[0]!.id}','${people[1]!.id}']::uuid[]`)}) and b_id = any(${sql.raw(`array['${people[0]!.id}','${people[1]!.id}']::uuid[]`)})`));
    expect(review).toEqual([{ status: "open" }]);
  });

  it("refund entries cannot be edited, and a refunded gift cannot be deleted", async () => {
    const [gift, refund] = await gifts("blair.ortiz@example.org");
    const today = new Date().toISOString().slice(0, 10);
    const edit = await call("PATCH", `/gifts/${refund!.id}`, { constituentId: (await as((tx) => tx.execute(sql`select constituent_id from gifts where id = ${refund!.id}`)))[0]!.constituent_id, amount: "5", giftDate: today });
    expect(edit.status).not.toBe(200);
    expect((await call("DELETE", `/gifts/${gift!.id}`)).status).not.toBe(204);
    expect(await gifts("blair.ortiz@example.org")).toHaveLength(2);
  });
});
