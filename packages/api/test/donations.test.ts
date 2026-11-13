import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, userClaims, withRls, type Db } from "@maple/db";
import { app, setDb, setMailer, setVerifier, type Mail } from "../src";
import { SimulatedStripeGateway, setStripeGateway, signManageLink, signState } from "../src/integrations";

/**
 * Fundraising Phase 2, the donor's side: sponsor an animal, give in memory of someone with a
 * note to a friend, get a correct receipt that counts as the thank-you, and manage a monthly
 * gift from the receipt's private link. Plus the owner's side: animals and receipt settings.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const json = { "content-type": "application/json" };
const form = { "content-type": "application/x-www-form-urlencoded" };

describe.skipIf(!DATABASE_URL)("donations: animals, tributes, receipts, monthly donors", () => {
  let db: Db;
  const owner = { id: randomUUID(), email: `don-owner-${randomUUID().slice(0, 8)}@test.invalid` };
  const staff = { id: randomUUID(), email: `don-staff-${randomUUID().slice(0, 8)}@test.invalid` };
  let orgId = "";
  let generalFund = "";
  let animalFund = "";
  let accountId = "";
  let pippinId = "";
  const slug = `donations-${randomUUID().slice(0, 8)}`;
  const sent: Mail[] = [];
  const auth = (u: { id: string }) => ({ authorization: `Bearer token:${u.id}:aal2`, ...json });
  const call = (u: { id: string }, method: string, path: string, body?: unknown) => app.request(`/api/v1/orgs/${orgId}${path}`, { method, headers: auth(u), body: body ? JSON.stringify(body) : undefined });
  const gw = new SimulatedStripeGateway("whsec_test_donations", () => "http://localhost:3000", async (body, signature) => {
    const r = await app.request("/api/v1/webhooks/stripe", { method: "POST", headers: { ...json, "stripe-signature": signature }, body });
    expect(r.status).toBe(200);
  });
  const as = <T>(f: (tx: Parameters<Parameters<typeof withRls>[2]>[0]) => Promise<T>) => withRls(db, userClaims(owner.id, "aal2"), f);

  async function checkout(body: Record<string, unknown>, donor: { name: string; email: string }) {
    const r = await app.request(`/api/v1/public/give/${slug}/checkout`, { method: "POST", headers: { ...json, "x-forwarded-for": `203.0.113.${randomUUID()}` }, body: JSON.stringify(body) });
    if (r.status !== 200) return r;
    const path = new URL(((await r.json()) as { url: string }).url).pathname;
    const pay = await app.request(path, { method: "POST", headers: form, body: new URLSearchParams({ ...donor, line1: "9 Water St", city: "Hallowell", state: "ME", postal: "04347" }).toString() });
    expect(pay.status).toBe(303);
    return r;
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
    setMailer({ from: "Rootwell <receipts@rootwell.test>", send: async (m) => void sent.push(m) });
    for (const u of [owner, staff]) {
      await db.execute(sql`
        insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (${u.id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${u.email}, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())`);
    }
    orgId = ((await (await app.request("/api/v1/orgs", { method: "POST", headers: auth(owner), body: JSON.stringify({ name: "Hallowell Animal Rescue" }) })).json()) as { id: string }).id;
    await db.execute(sql`insert into org_memberships (org_id, user_id, role, status, accepted_at) values (${orgId}, ${staff.id}, 'staff', 'active', now())`);
    await call(owner, "PATCH", "", { name: "Hallowell Animal Rescue", ein: "123456789", address: {}, fiscalYearStartMonth: 1, timezone: "America/New_York" });
    generalFund = ((await (await call(owner, "POST", "/coding/funds", { name: "General" })).json()) as { id: string }).id;
    animalFund = ((await (await call(owner, "POST", "/coding/funds", { name: "Animal sponsorships" })).json()) as { id: string }).id;
    const start = new URL(((await (await call(owner, "POST", "/integrations/stripe/connect")).json()) as { url: string }).url);
    const approve = await app.request("/api/v1/stripe-sim/connect", { method: "POST", headers: form, body: new URLSearchParams({ state: start.searchParams.get("state")!, redirect_uri: start.searchParams.get("redirect_uri")! }).toString() });
    const back = new URL(approve.headers.get("location")!);
    accountId = ((await (await call(owner, "POST", "/integrations/stripe/complete", { code: back.searchParams.get("code"), state: back.searchParams.get("state") })).json()) as { accountId: string }).accountId;
  });

  afterAll(async () => {
    await db.execute(sql`delete from organizations where id = ${orgId}`);
    for (const u of [owner, staff]) await db.execute(sql`delete from auth.users where id = ${u.id}`);
    setStripeGateway(undefined);
    setMailer(undefined);
    setVerifier(undefined);
    setDb(undefined);
  });

  it("owners keep the animals list; staff can see it but not change it", async () => {
    expect((await call(staff, "POST", "/animals", { name: "Sneaky" })).status).toBe(403);
    const r = await call(owner, "POST", "/animals", { name: "Pippin", description: "A shy tabby who loves sunny windows.", fundId: animalFund });
    expect(r.status).toBe(201);
    pippinId = ((await r.json()) as { id: string }).id;
    expect((await call(owner, "POST", "/animals", { name: "Bad photo", photoPath: `${randomUUID()}/cat.png` })).status).toBe(400);
    const list = (await (await call(staff, "GET", "/animals")).json()) as { items: { name: string; fundName: string }[] };
    expect(list.items).toEqual([expect.objectContaining({ name: "Pippin", fundName: "Animal sponsorships" })]);
  });

  it("a giving page offers animals, tributes and a message only when switched on", async () => {
    const page = { slug, title: "Help our animals", fundIds: [generalFund], allowTribute: true, allowMessage: true, animalIds: [pippinId] };
    expect((await call(owner, "POST", "/donation-pages", page)).status).toBe(201);
    const pub = (await (await app.request(`/api/v1/public/give/${slug}`)).json()) as { allowTribute: boolean; allowMessage: boolean; animals: { id: string; name: string }[] };
    expect(pub).toMatchObject({ allowTribute: true, allowMessage: true, animals: [{ id: pippinId, name: "Pippin", description: "A shy tabby who loves sunny windows.", photoPath: null }] });
    // An animal from somewhere else is refused.
    expect((await checkout({ amount: 20, animalId: randomUUID() }, { name: "X", email: "x@example.org" })).status).toBe(400);
  });

  it("a gift sponsoring Pippin in memory of a pet goes to the animal's fund, with a tribute, a message and a receipt", async () => {
    sent.length = 0;
    await checkout(
      { amount: 50, animalId: pippinId, message: "For all the shy ones.", tribute: { kind: "memory", honoreeName: "Biscuit", notifyName: "Jordan Lake", notifyEmail: "jordan.lake@example.org" } },
      { name: "Riley Dunn", email: "riley.dunn@example.org" },
    );
    const g = (await as((tx) => tx.execute(sql`select id, fund_id, sponsor_animal_id, donor_message, acknowledged_at, acknowledgment_method from gifts where org_id = ${orgId}`)))[0] as Record<string, string | null>;
    expect(g).toMatchObject({ fund_id: animalFund, sponsor_animal_id: pippinId, donor_message: "For all the shy ones.", acknowledgment_method: "Email receipt" });
    expect(g.acknowledged_at).not.toBeNull();

    const tribute = (await (await call(staff, "GET", `/gifts/${g.id}/tribute`)).json()) as Record<string, string | null>;
    expect(tribute).toMatchObject({ kind: "memory", honoreeName: "Biscuit", notifyEmail: "jordan.lake@example.org" });
    expect(tribute.notifiedAt).not.toBeNull();

    // The receipt: from the organization's name, with what the IRS asks for.
    const receipt = sent.find((m) => m.to === "riley.dunn@example.org")!;
    expect(receipt.fromName).toBe("Hallowell Animal Rescue");
    expect(receipt.text).toContain("Amount: $50.00");
    expect(receipt.text).toContain("For: Sponsoring Pippin");
    expect(receipt.text).toContain("In memory of: Biscuit");
    expect(receipt.text).toContain("No goods or services were provided in exchange for this contribution.");
    expect(receipt.text).toContain("Section 501(c)(3)");
    expect(receipt.text).toContain("Our EIN is 12-3456789.");
    expect(receipt.text).not.toContain("monthly");

    // The friend hears about the tribute, but not the amount.
    const notice = sent.find((m) => m.to === "jordan.lake@example.org")!;
    expect(notice.subject).toBe("A gift in memory of Biscuit");
    expect(notice.text).toContain("Riley Dunn made a gift to Hallowell Animal Rescue in memory of Biscuit");
    expect(notice.text).not.toContain("$");

    // The receipt was the thank-you: nothing waits on the thank-you list.
    const todo = (await (await call(staff, "GET", "/gifts?filter=unacknowledged")).json()) as { total: number };
    expect(todo.total).toBe(0);
  });

  it("owners edit the receipt; the next receipt uses it and replies go to the office", async () => {
    expect((await call(staff, "PUT", "/receipts", { enabled: true, thankYou: "Sneaky" })).status).toBe(403);
    expect((await call(owner, "PUT", "/receipts", { enabled: true, thankYou: "Every tail wags because of you.", replyTo: "office@hallowell-rescue.org" })).status).toBe(200);
    const got = (await (await call(staff, "GET", "/receipts")).json()) as { resolved: { thankYou: string; taxStatement: string } };
    expect(got.resolved.thankYou).toBe("Every tail wags because of you.");
    sent.length = 0;
    await checkout({ amount: 15 }, { name: "Sky Park", email: "sky.park@example.org" });
    expect(sent[0]).toMatchObject({ to: "sky.park@example.org", replyTo: "office@hallowell-rescue.org" });
    expect(sent[0]!.text).toContain("Every tail wags because of you.");
    expect(sent[0]!.text).toContain("For: General");
  });

  it("with receipts off, the gift waits on the thank-you list", async () => {
    expect((await call(owner, "PUT", "/receipts", { enabled: false })).status).toBe(200);
    sent.length = 0;
    await checkout({ amount: 12 }, { name: "Lee Ford", email: "lee.ford@example.org" });
    expect(sent).toHaveLength(0);
    const g = (await as((tx) => tx.execute(sql`select acknowledged_at from gifts g join constituent_emails e on e.constituent_id = g.constituent_id where e.email = 'lee.ford@example.org'`)))[0] as { acknowledged_at: string | null };
    expect(g.acknowledged_at).toBeNull();
    expect((await call(owner, "PUT", "/receipts", { enabled: true })).status).toBe(200);
  });

  it("a monthly donor's receipt links to a private page where they can stop the gift", async () => {
    sent.length = 0;
    await checkout({ amount: 10, monthly: true, tribute: { kind: "honor", honoreeName: "Grandma Rose" } }, { name: "Morgan Hale", email: "morgan.hale@example.org" });
    const receipt = sent.find((m) => m.to === "morgan.hale@example.org")!;
    expect(receipt.text).toContain("(monthly gift)");
    expect(receipt.text).toContain("In honor of: Grandma Rose");
    const link = /\/manage\/([A-Za-z0-9_.-]+)/.exec(receipt.text)![1]!;

    // The second month: a receipt, but the tribute stays with the first gift.
    const plan = (await as((tx) => tx.execute(sql`select id, external_id from recurring_plans where org_id = ${orgId}`)))[0] as { id: string; external_id: string };
    await gw.chargeSubscription(plan.external_id);
    const tributes = await as((tx) => tx.execute(sql`select t.gift_id from gift_tributes t join gifts g on g.id = t.gift_id where g.recurring_plan_id = ${plan.id}`));
    expect(tributes).toHaveLength(1);

    const page = await app.request(`/api/v1/public/manage/${link}`);
    expect(page.status).toBe(200);
    expect(await page.json()).toMatchObject({ orgName: "Hallowell Animal Rescue", amount: "10.00", status: "active" });

    const go = await app.request(`/api/v1/public/manage/${link}`, { method: "POST" });
    expect(go.status).toBe(200);
    const portal = new URL(((await go.json()) as { url: string }).url);
    expect(portal.pathname).toBe(`/api/v1/stripe-sim/portal/${plan.external_id}`);
    const stop = await app.request(`${portal.pathname}${portal.search}`, { method: "POST", headers: form, body: "action=cancel" });
    expect(stop.status).toBe(200);
    const ended = (await as((tx) => tx.execute(sql`select status from recurring_plans where id = ${plan.id}`)))[0] as { status: string };
    expect(ended.status).toBe("ended");
    expect((await app.request(`/api/v1/public/manage/${link}`, { method: "POST" })).status).toBe(409);
  });

  it("a changed, foreign or OAuth-style link opens nothing", async () => {
    const real = signManageLink({ orgId, subscriptionId: "sub_sim_x" });
    const [body, sig] = real.split(".");
    const tampered = `${Buffer.from(JSON.stringify({ o: orgId, s: "sub_other", exp: 9e9 })).toString("base64url")}.${sig}`;
    expect((await app.request(`/api/v1/public/manage/${tampered}`)).status).toBe(404);
    expect((await app.request(`/api/v1/public/manage/${body}.${"A".repeat(43)}`)).status).toBe(404);
    // A signed OAuth state is not a manage link.
    expect((await app.request(`/api/v1/public/manage/${signState({ orgId, userId: owner.id })}`)).status).toBe(404);
  });

  it("an animal with gifts can be hidden but not deleted", async () => {
    expect((await call(owner, "DELETE", `/animals/${pippinId}`)).status).toBe(409);
    expect((await call(owner, "PUT", `/animals/${pippinId}`, { name: "Pippin", fundId: animalFund, active: false })).status).toBe(200);
    const pub = (await (await app.request(`/api/v1/public/give/${slug}`)).json()) as { animals: unknown[] };
    expect(pub.animals).toEqual([]);
  });
});
