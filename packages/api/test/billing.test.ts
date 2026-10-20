import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@maple/db";
import { app, setDb, setVerifier } from "../src";
import { SimulatedBillingGateway, setBillingGateway } from "../src/integrations";

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

/** Phase 6 billing: trial, subscribe through the Stripe Billing stand-in, lapse, read only, restart. */
describe.skipIf(!DATABASE_URL)("billing", () => {
  let db: Db;
  let owner: U;
  let admin: U;
  let orgId = "";
  let subId = "";
  const statuses: number[] = [];
  const gw = new SimulatedBillingGateway("whsec_billing_test", () => "http://localhost:3000", async (body, signature) => {
    statuses.push((await app.request("/api/v1/webhooks/stripe-billing", { method: "POST", headers: { ...json, "stripe-signature": signature }, body })).status);
  });
  const h = (u: U) => ({ authorization: `Bearer token:${u.id}:aal2`, ...json });
  const call = (u: U, method: string, path: string, body?: unknown) => app.request(`/api/v1/orgs/${orgId}${path}`, { method, headers: h(u), body: body ? JSON.stringify(body) : undefined });
  const billing = async () => (await (await call(owner, "GET", "/billing")).json()) as { status: string; writable: boolean; trialEndsAt: string | null; readOnlyUntil: string | null; hasSubscription: boolean; mode: string };
  const portal = async () => {
    const url = ((await (await call(owner, "POST", "/billing/portal")).json()) as { url: string }).url;
    return new URL(url).pathname;
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    setDb(db);
    setVerifier(async (token) => {
      const [, sub, aal] = token.split(":");
      return { sub, aal };
    });
    setBillingGateway(gw);
    owner = await createUser(db, "bill-owner");
    admin = await createUser(db, "bill-admin");
    orgId = ((await (await app.request("/api/v1/orgs", { method: "POST", headers: h(owner), body: JSON.stringify({ name: "Lakeside Literacy" }) })).json()) as { id: string }).id;
    await db.execute(sql`insert into org_memberships (org_id, user_id, role, status, accepted_at) values (${orgId}, ${admin.id}, 'admin', 'active', now())`);
  });
  afterAll(async () => {
    await db.execute(sql`delete from organizations where id = ${orgId}`);
    for (const u of [owner, admin]) await db.execute(sql`delete from auth.users where id = ${u.id}`);
    setBillingGateway(undefined);
    setVerifier(undefined);
    setDb(undefined);
  });

  it("starts on a 30-day trial", async () => {
    const b = await billing();
    expect(b).toMatchObject({ status: "trialing", writable: true, hasSubscription: false, mode: "simulated" });
    expect(new Date(b.trialEndsAt!).getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
  });

  it("only the owner subscribes, and the trial days carry over", async () => {
    expect((await call(admin, "POST", "/billing/checkout")).status).toBe(403);
    const r = await call(owner, "POST", "/billing/checkout");
    expect(r.status).toBe(200);
    const path = new URL(((await r.json()) as { url: string }).url).pathname;
    const pageHtml = await (await app.request(path)).text();
    expect(pageHtml).toContain("Your free trial continues until");
    const paid = await app.request(path, { method: "POST" });
    expect(paid.status).toBe(303);
    expect(paid.headers.get("location")).toContain("/settings/billing?subscribed=1");
    expect(statuses.every((s) => s === 200)).toBe(true);
    const b = await billing();
    expect(b).toMatchObject({ status: "trialing", hasSubscription: true, writable: true });
    expect((await call(owner, "POST", "/billing/checkout")).status).toBe(409);
  });

  it("a failed payment keeps access while Stripe retries", async () => {
    await app.request(`${await portal()}/past_due`, { method: "POST" });
    expect(await billing()).toMatchObject({ status: "past_due", writable: true });
  });

  it("a canceled subscription makes the account read only for 90 days, with a plain message", async () => {
    await app.request(`${await portal()}/canceled`, { method: "POST" });
    const b = await billing();
    expect(b).toMatchObject({ status: "canceled", writable: false });
    const days = (new Date(b.readOnlyUntil!).getTime() - Date.now()) / 86400_000;
    expect(Math.round(days)).toBe(90);

    const blocked = await call(owner, "POST", "/constituents", { lastName: "Nguyen" });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ readOnly: true, error: expect.stringContaining("read only") });
    // Reads and handing over the account still work.
    expect((await call(admin, "GET", "/constituents")).status).toBe(200);
    expect((await call(owner, "GET", "/billing")).status).toBe(200);
    expect((await call(owner, "PATCH", "/board-settings", { hideBoardNames: true })).status).toBe(200);
  });

  it("restarting the subscription restores changes and clears the read-only date (trial days left still count)", async () => {
    const r = await call(owner, "POST", "/billing/checkout");
    expect(r.status).toBe(200);
    await app.request(new URL(((await r.json()) as { url: string }).url).pathname, { method: "POST" });
    const b = await billing();
    expect(b).toMatchObject({ status: "trialing", writable: true, readOnlyUntil: null, hasSubscription: true });
    expect((await call(owner, "POST", "/constituents", { lastName: "Nguyen" })).status).toBe(201);
    // When the trial ends, Stripe charges the card and the subscription becomes active.
    await app.request(`${await portal()}/active`, { method: "POST" });
    expect(await billing()).toMatchObject({ status: "active", writable: true });
  });

  it("a trial that ends without a subscription is read only", async () => {
    await db.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ actor: "system", role: "authenticated", org_id: orgId })}, false)`);
    await db.execute(sql`update organizations set subscription_status = 'trialing', stripe_subscription_id = null, trial_ends_at = now() - interval '1 minute' where id = ${orgId}`);
    await db.execute(sql`select set_config('request.jwt.claims', '', false)`);
    expect(await billing()).toMatchObject({ status: "trialing", writable: false });
    expect((await call(owner, "POST", "/tags", { name: "Volunteer" })).status).toBe(403);
  });

  it("rejects billing events without a valid signature, and ignores replays", async () => {
    const body = JSON.stringify({ id: "evt_forged", type: "customer.subscription.updated", data: { object: { id: "sub_x", status: "active", metadata: { orgId } } } });
    expect((await app.request("/api/v1/webhooks/stripe-billing", { method: "POST", headers: { ...json, "stripe-signature": "t=1,v1=bad" }, body })).status).toBe(400);
    const { default: Stripe } = await import("stripe");
    const signed = (b: string) => new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload: b, secret: "whsec_billing_test" });
    const ev = JSON.stringify({ id: `evt_${randomUUID()}`, object: "event", type: "customer.subscription.updated", created: 1, data: { object: { id: "sub_replay", object: "subscription", customer: "cus_r", status: "active", trial_end: null, metadata: { orgId } } } });
    expect((await app.request("/api/v1/webhooks/stripe-billing", { method: "POST", headers: { ...json, "stripe-signature": signed(ev) }, body: ev })).status).toBe(200);
    expect(await (await app.request("/api/v1/webhooks/stripe-billing", { method: "POST", headers: { ...json, "stripe-signature": signed(ev) }, body: ev })).json()).toEqual({ duplicate: true });
    void subId;
  });
});
