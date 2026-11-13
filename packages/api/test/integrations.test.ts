import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, userClaims, withRls, type Db } from "@maple/db";
import { app, setDb, setVerifier } from "../src";
import { SimulatedMailchimpGateway, SimulatedStripeGateway, grossUpForFee, setStripeGateway } from "../src/integrations";

const DATABASE_URL = process.env.DATABASE_URL;
type U = { id: string; email: string };
const json = { "content-type": "application/json" };
const form = { "content-type": "application/x-www-form-urlencoded" };

async function createUser(db: Db, label: string): Promise<U> {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@test.invalid`;
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${email}, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())`);
  return { id, email };
}

/** Parses our CSV (no quoted commas in these fixtures). */
const csvRows = (text: string) =>
  text.replace(/^\uFEFF/, "").trim().split("\r\n").slice(1).map((l) => l.split(","));

/**
 * Phase 5 acceptance, end to end through the HTTP API against the Stripe and Mailchimp
 * simulators. Webhooks are signed with Stripe's real scheme and delivered to our route.
 */
describe.skipIf(!DATABASE_URL)("integrations: online giving, payouts, Mailchimp, QuickBooks", () => {
  let db: Db;
  let owner: U;
  let staff: U;
  let orgId = "";
  let fundId = "";
  let danaId = "";
  let ruthId = "";
  let accountId = "";
  const slug = `riverside-${randomUUID().slice(0, 8)}`;
  const mcKey = `sim-key-${randomUUID().slice(0, 8)}-us1`;
  const deliveries: number[] = [];
  const h = (u: U, aal = "aal2") => ({ authorization: `Bearer token:${u.id}:${aal}`, ...json });
  const call = (u: U, method: string, path: string, body?: unknown, aal = "aal2") =>
    app.request(`/api/v1/orgs/${orgId}${path}`, { method, headers: h(u, aal), body: body ? JSON.stringify(body) : undefined });
  const gw = new SimulatedStripeGateway("whsec_test_phase5", () => "http://localhost:3000", async (body, signature) => {
    const r = await app.request("/api/v1/webhooks/stripe", { method: "POST", headers: { ...json, "stripe-signature": signature }, body });
    deliveries.push(r.status);
  });
  const giftsFor = (constituentId: string) =>
    withRls(db, userClaims(owner.id, "aal2"), (tx) =>
      tx.execute(sql`select amount::text, fee_amount::text as fee, net_amount::text as net, fee_covered_amount::text as covered, source_platform, external_id, fund_id, batch_id, posted_at, gift_type, recurring_plan_id
                       from gifts where org_id = ${orgId} and constituent_id = ${constituentId} order by created_at`),
    ) as Promise<Record<string, string | null>[]>;

  async function donate(body: Record<string, unknown>, donor: Record<string, string>) {
    const r = await app.request(`/api/v1/public/give/${slug}/checkout`, { method: "POST", headers: json, body: JSON.stringify(body) });
    expect(r.status).toBe(200);
    const { url } = (await r.json()) as { url: string };
    const sessionPath = new URL(url).pathname;
    const pay = await app.request(sessionPath, { method: "POST", headers: form, body: new URLSearchParams(donor).toString() });
    expect(pay.status).toBe(303);
    expect(pay.headers.get("location")).toContain(`/give/${slug}/thanks`);
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
    owner = await createUser(db, "p5-owner");
    staff = await createUser(db, "p5-staff");
    orgId = ((await (await app.request("/api/v1/orgs", { method: "POST", headers: h(owner), body: JSON.stringify({ name: "Riverside Food Pantry" }) })).json()) as { id: string }).id;
    await db.execute(sql`insert into org_memberships (org_id, user_id, role, status, accepted_at) values (${orgId}, ${staff.id}, 'staff', 'active', now())`);
    fundId = ((await (await call(owner, "POST", "/coding/funds", { name: "General operating", incomeAccount: "4000 Contributions:General" })).json()) as { id: string }).id;
    const person = async (body: unknown) => ((await (await call(owner, "POST", "/constituents", body)).json()) as { id: string }).id;
    danaId = await person({ firstName: "Dana", lastName: "Rivera", emails: [{ email: "dana.rivera@example.org" }], addresses: [{ line1: "12 Elm St", city: "Springfield", state: "IL", postalCode: "62701" }] });
    ruthId = await person({ firstName: "Ruth", lastName: "Goldberg", doNotEmail: true, emails: [{ email: "ruth.goldberg@example.org" }] });
  });

  afterAll(async () => {
    await db.execute(sql`delete from organizations where id = ${orgId}`);
    for (const u of [owner, staff]) await db.execute(sql`delete from auth.users where id = ${u.id}`);
    setStripeGateway(undefined);
    setVerifier(undefined);
    setDb(undefined);
  });

  it("only owners and admins with two-step sign-in connect Stripe", async () => {
    expect((await call(staff, "POST", "/integrations/stripe/connect")).status).toBe(403);
    expect((await call(owner, "POST", "/integrations/stripe/connect", undefined, "aal1")).status).toBe(403);

    const start = await call(owner, "POST", "/integrations/stripe/connect");
    expect(start.status).toBe(200);
    const url = new URL(((await start.json()) as { url: string }).url);
    expect(url.pathname).toBe("/api/v1/stripe-sim/connect");
    const state = url.searchParams.get("state")!;

    // The consent page refuses to send anyone to another site.
    const evil = await app.request("/api/v1/stripe-sim/connect", { method: "POST", headers: form, body: new URLSearchParams({ state, redirect_uri: "https://evil.example/x" }).toString() });
    expect(evil.status).toBe(400);

    const approve = await app.request("/api/v1/stripe-sim/connect", { method: "POST", headers: form, body: new URLSearchParams({ state, redirect_uri: url.searchParams.get("redirect_uri")! }).toString() });
    expect(approve.status).toBe(303);
    const back = new URL(approve.headers.get("location")!);
    const code = back.searchParams.get("code")!;

    // A state signed for the owner does not work for anyone else.
    expect((await call(staff, "POST", "/integrations/stripe/complete", { code, state })).status).toBe(400);
    const done = await call(owner, "POST", "/integrations/stripe/complete", { code, state });
    expect(done.status).toBe(200);
    accountId = ((await done.json()) as { accountId: string }).accountId;

    const list = (await (await call(staff, "GET", "/integrations")).json()) as { items: { provider: string; status: string }[]; stripeMode: string };
    expect(list.stripeMode).toBe("simulated");
    expect(list.items).toEqual([expect.objectContaining({ provider: "stripe", status: "connected" })]);
  });

  it("publishes a donation page that shows nothing private", async () => {
    expect((await call(staff, "POST", "/donation-pages", { slug, title: "Feed a neighbor" })).status).toBe(403);
    const r = await call(owner, "POST", "/donation-pages", { slug, title: "Feed a neighbor", intro: "Every $25 feeds a family for a week.", fundIds: [fundId] });
    expect(r.status).toBe(201);
    expect((await call(owner, "POST", "/donation-pages", { slug, title: "Copy" })).status).toBe(409);

    const pub = await app.request(`/api/v1/public/give/${slug}`);
    expect(pub.status).toBe(200);
    const body = (await pub.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ orgName: "Riverside Food Pantry", title: "Feed a neighbor", takingGifts: true, amounts: [25, 50, 100, 250] });
    expect(JSON.stringify(body)).not.toContain(accountId);
    expect(JSON.stringify(body)).not.toContain(orgId);
    expect((await app.request(`/api/v1/public/give/no-such-page-here`)).status).toBe(404);
  });

  it("a simulated donation becomes a gift on the existing donor, with fees", async () => {
    await donate({ amount: 100, coverFee: true }, { name: "Dana Rivera", email: "Dana.Rivera@example.org", line1: "12 Elm St", city: "Springfield", state: "IL", postal: "62701" });
    expect(deliveries).toEqual([200]);

    const gifts = await giftsFor(danaId);
    expect(gifts).toHaveLength(1);
    const total = grossUpForFee(10000);
    const fee = Math.round(total * 0.022) + 30;
    expect(gifts[0]).toMatchObject({
      amount: (total / 100).toFixed(2),
      fee: (fee / 100).toFixed(2),
      net: ((total - fee) / 100).toFixed(2),
      covered: ((total - 10000) / 100).toFixed(2),
      source_platform: "stripe",
      fund_id: fundId,
      batch_id: null,
      posted_at: null,
      gift_type: "one_time",
    });
    // No new constituent was made for Dana.
    const people = await withRls(db, userClaims(owner.id, "aal2"), (tx) => tx.execute(sql`select count(*)::int as n from constituents where org_id = ${orgId}`));
    expect((people[0] as { n: number }).n).toBe(2);
  });

  it("ignores a replayed event and rejects a bad signature", async () => {
    const last = gw["constructor"] && (globalThis as unknown as { __mapleStripeSim: { sent: { id: string }[] } }).__mapleStripeSim.sent.at(-1)!;
    const body = JSON.stringify(last);
    const { default: Stripe } = await import("stripe");
    const sig = new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload: body, secret: "whsec_test_phase5" });
    const again = await app.request("/api/v1/webhooks/stripe", { method: "POST", headers: { ...json, "stripe-signature": sig }, body });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ duplicate: true });
    expect(await giftsFor(danaId)).toHaveLength(1);

    const forged = await app.request("/api/v1/webhooks/stripe", { method: "POST", headers: { ...json, "stripe-signature": "t=1,v1=deadbeef" }, body });
    expect(forged.status).toBe(400);
    const unsigned = await app.request("/api/v1/webhooks/stripe", { method: "POST", headers: json, body });
    expect(unsigned.status).toBe(400);
  });

  let samId = "";
  it("a monthly gift makes a recurring plan and a gift each month, and ends on cancel", async () => {
    await donate({ amount: 25, monthly: true, fundId }, { name: "Sam Lee", email: "sam.lee@example.org", line1: "4 Birch Ln", city: "Chatham", state: "IL", postal: "62629" });
    const plan = await withRls(db, userClaims(owner.id, "aal2"), (tx) => tx.execute(sql`select id, constituent_id, amount::text, status, external_id from recurring_plans where org_id = ${orgId}`));
    expect(plan).toHaveLength(1);
    const p = plan[0] as { id: string; constituent_id: string; amount: string; status: string; external_id: string };
    expect(p).toMatchObject({ amount: "25.00", status: "active" });
    samId = p.constituent_id;
    await gw.chargeSubscription(p.external_id);
    const gifts = await giftsFor(samId);
    expect(gifts.map((g) => [g.amount, g.gift_type, g.recurring_plan_id])).toEqual([
      ["25.00", "recurring", p.id],
      ["25.00", "recurring", p.id],
    ]);
    await gw.cancelSubscription(p.external_id);
    const ended = await withRls(db, userClaims(owner.id, "aal2"), (tx) => tx.execute(sql`select status from recurring_plans where id = ${p.id}`));
    expect((ended[0] as { status: string }).status).toBe("ended");
    expect(deliveries.every((s) => s === 200)).toBe(true);
  });

  let payoutBatch = "";
  it("a payout becomes one batch that posts and reconciles to the deposit", async () => {
    expect((await call(staff, "POST", "/integrations/stripe/simulate-payout")).status).toBe(403);
    const r = await call(owner, "POST", "/integrations/stripe/simulate-payout");
    expect(r.status).toBe(200);
    const { amount: netCents } = (await r.json()) as { amount: number };

    const batches = (await (await call(owner, "GET", "/batches?status=open")).json()) as { items: { id: string; expectedTotal: string | null; expectedCount: number | null; giftCount?: number }[] };
    expect(batches.items).toHaveLength(1);
    payoutBatch = batches.items[0]!.id;
    const all = [...(await giftsFor(danaId)), ...(await giftsFor(samId))];
    expect(all.every((g) => g.batch_id === payoutBatch)).toBe(true);
    const gross = all.reduce((s, g) => s + Math.round(Number(g.amount) * 100), 0);
    const fees = all.reduce((s, g) => s + Math.round(Number(g.fee) * 100), 0);
    expect(gross - fees).toBe(netCents);
    expect(batches.items[0]!.expectedTotal).toBe((gross / 100).toFixed(2));

    const posted = await call(owner, "POST", `/batches/${payoutBatch}/post`);
    expect(posted.status).toBe(200);
  });

  it("the QuickBooks journal balances and matches the posted batches", async () => {
    // A cash batch too, so the export covers both kinds of deposit.
    const today = new Date().toISOString().slice(0, 10);
    const building = ((await (await call(owner, "POST", "/coding/funds", { name: "Building fund" })).json()) as { id: string }).id;
    const cash = ((await (await call(owner, "POST", "/batches", { batchDate: today, description: "Sunday collection" })).json()) as { id: string }).id;
    const c1 = await call(owner, "POST", "/gifts", { batchId: cash, constituentId: ruthId, fundId: building, amount: "40", giftDate: today, paymentMethod: "cash" });
    expect(c1.status, await c1.clone().text()).toBe(201);
    const ik = await call(owner, "POST", "/gifts", { batchId: cash, constituentId: ruthId, fundId: building, amount: "500", giftDate: today, paymentMethod: "in_kind", giftType: "in_kind", fairMarketValue: "500" });
    expect(ik.status, await ik.clone().text()).toBe(201);
    expect((await call(owner, "POST", `/batches/${cash}/post`)).status).toBe(200);
    expect((await call(owner, "PUT", "/accounting", { depositAccount: "1000 Checking", feeAccount: "6100 Merchant fees", defaultIncomeAccount: "4000 Contributions" })).status).toBe(200);

    const year = today.slice(0, 4);
    const res = await call(owner, "GET", `/accounting/export?from=${year}-01-01&to=${year}-12-31`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text.replace(/^\uFEFF/, "").split("\r\n")[0]).toBe("Journal No,Journal Date,Account,Debits,Credits,Description,Name");
    const rows = csvRows(text);
    const byJournal = new Map<string, { d: number; c: number }>();
    for (const r of rows) {
      const t = byJournal.get(r[0]!) ?? { d: 0, c: 0 };
      t.d += Math.round(Number(r[3] || 0) * 100);
      t.c += Math.round(Number(r[4] || 0) * 100);
      byJournal.set(r[0]!, t);
    }
    expect(byJournal.size).toBe(2);
    for (const t of byJournal.values()) expect(t.d).toBe(t.c);

    // Credits equal the money gifts in posted batches; the in-kind gift is left out.
    const posted = await withRls(db, userClaims(owner.id, "aal2"), (tx) =>
      tx.execute(sql`select coalesce(sum(amount), 0)::text as total from gifts where org_id = ${orgId} and posted_at is not null and gift_type not in ('in_kind', 'soft_credit', 'pledge')`),
    );
    const credits = [...byJournal.values()].reduce((s, t) => s + t.c, 0);
    expect(credits).toBe(Math.round(Number((posted[0] as { total: string }).total) * 100));
    expect(rows.some((r) => r[2] === "6100 Merchant fees")).toBe(true);
    expect(rows.some((r) => r[2] === "4000 Contributions:General")).toBe(true);
    expect(rows.some((r) => r[2] === "4000 Contributions" && r[4] === "40.00")).toBe(true);
    expect(rows[0]![1]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

    const deposits = csvRows(await (await call(owner, "GET", `/accounting/export?batchId=${payoutBatch}&format=deposits`)).text());
    expect(deposits).toHaveLength(1);
    const [, , count, gross, fee, net] = deposits[0]!;
    expect(Number(count)).toBe(3);
    expect(Math.round((Number(gross) - Number(fee)) * 100)).toBe(Math.round(Number(net) * 100));
  });

  it("a refund adds a reversing entry; a dispute waits on Data Health until marked done", async () => {
    const chargeId = (await giftsFor(danaId))[0]!.external_id!;
    await gw.refund(accountId, chargeId);
    const rows = await giftsFor(danaId);
    expect(rows.map((g) => g.gift_type)).toEqual(["one_time", "refund"]);
    expect(Number(rows[1]!.amount)).toBe(-Number(rows[0]!.amount));

    const samCharge = (await giftsFor(samId))[0]!.external_id!;
    await gw.dispute(accountId, samCharge);
    const health = (await (await call(staff, "GET", "/integrations/health")).json()) as { needsAttention: { id: string; type: string }[] };
    expect(health.needsAttention.find((x) => x.type === "charge.refunded")).toBeUndefined();
    const item = health.needsAttention.find((x) => x.type === "charge.dispute.created")!;
    expect((await call(staff, "POST", `/integrations/events/${item.id}/resolve`)).status).toBe(403);
    expect((await call(owner, "POST", `/integrations/events/${item.id}/resolve`)).status).toBe(200);
    const after = (await (await call(owner, "GET", "/integrations/health")).json()) as { needsAttention: { id: string }[] };
    expect(after.needsAttention.find((x) => x.id === item.id)).toBeUndefined();
  });

  it("Mailchimp: tags reflect the CRM after one sync, and opt-outs are respected", async () => {
    expect((await call(owner, "PUT", "/integrations/mailchimp/key", { apiKey: "not-a-real-key" })).status).toBe(400);
    expect((await call(staff, "PUT", "/integrations/mailchimp/key", { apiKey: mcKey })).status).toBe(403);
    expect((await call(owner, "PUT", "/integrations/mailchimp/key", { apiKey: mcKey })).status).toBe(200);

    // Signed-in people never read the stored key, even owners.
    await expect(withRls(db, userClaims(owner.id, "aal2"), (tx) => tx.execute(sql`select credentials from integrations where org_id = ${orgId}`))).rejects.toThrow();
    const stored = await db.execute(sql`select credentials from integrations where org_id = ${orgId} and provider = 'mailchimp'`);
    expect(String((stored[0] as { credentials: string }).credentials)).not.toContain(mcKey);

    expect((await call(owner, "POST", "/integrations/mailchimp/sync")).status).toBe(409);
    const aud = (await (await call(owner, "GET", "/integrations/mailchimp/audiences")).json()) as { items: { id: string; name: string }[] };
    const donors = aud.items.find((a) => a.name === "Donors")!;
    expect((await call(owner, "PATCH", "/integrations/mailchimp/config", { listId: donors.id, permissionConfirmed: true })).status).toBe(200);

    const tag = ((await (await call(owner, "POST", "/tags", { name: "Volunteer" })).json()) as { id: string }).id;
    expect((await call(owner, "PUT", `/constituents/${danaId}/tags`, { tagIds: [tag] })).status).toBe(200);

    const sync = await call(owner, "POST", "/integrations/mailchimp/sync");
    expect(sync.status).toBe(200);
    expect(await sync.json()).toMatchObject({ sent: 2, unsubscribed: 1, failed: 0 });

    const mc = new SimulatedMailchimpGateway(mcKey);
    const dana = mc.member(donors.id, "dana.rivera@example.org")!;
    expect(dana.status).toBe("subscribed");
    expect([...dana.tags].sort()).toEqual(["Donor", "Volunteer"]);
    const sam = mc.member(donors.id, "sam.lee@example.org")!;
    expect([...sam.tags]).toEqual(["Donor"]);
    expect(mc.member(donors.id, "ruth.goldberg@example.org")).toBeNull();

    // Dana unsubscribes in Mailchimp; a later sync never resubscribes her. Removing her
    // tag in the CRM removes it in Mailchimp.
    mc.setStatus(donors.id, "dana.rivera@example.org", "unsubscribed");
    expect((await call(owner, "PUT", `/constituents/${danaId}/tags`, { tagIds: [] })).status).toBe(200);
    expect((await call(owner, "POST", "/integrations/mailchimp/sync")).status).toBe(200);
    expect(mc.member(donors.id, "dana.rivera@example.org")).toMatchObject({ status: "unsubscribed" });
    expect([...mc.member(donors.id, "dana.rivera@example.org")!.tags]).toEqual(["Donor"]);

    const list = (await (await call(owner, "GET", "/integrations")).json()) as { items: { provider: string; lastSyncSummary: Record<string, number> | null }[] };
    expect(list.items.find((i) => i.provider === "mailchimp")?.lastSyncSummary).toMatchObject({ sent: 2, failed: 0 });
  });

  it("disconnecting Stripe stops the giving page from taking gifts", async () => {
    expect((await call(owner, "DELETE", "/integrations/stripe")).status).toBe(204);
    const pub = (await (await app.request(`/api/v1/public/give/${slug}`)).json()) as { takingGifts: boolean };
    expect(pub.takingGifts).toBe(false);
    const r = await app.request(`/api/v1/public/give/${slug}/checkout`, { method: "POST", headers: json, body: JSON.stringify({ amount: 10 }) });
    expect(r.status).toBe(409);
  });
});
