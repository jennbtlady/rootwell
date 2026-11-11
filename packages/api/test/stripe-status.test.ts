import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@maple/db";
import { app, setDb, setVerifier } from "../src";
import { SimulatedStripeGateway, setStripeGateway } from "../src/integrations";

/**
 * Fundraising Phase 1: a Standard account can connect before it can take payments. Rootwell
 * shows "needs more information", keeps giving pages off, and turns them on when Stripe says
 * the account is ready (the account.updated webhook, or "Check again").
 */
const DATABASE_URL = process.env.DATABASE_URL;
const json = { "content-type": "application/json" };
const form = { "content-type": "application/x-www-form-urlencoded" };

describe.skipIf(!DATABASE_URL)("Stripe connection status", () => {
  let db: Db;
  const owner = { id: randomUUID(), email: `status-owner-${randomUUID().slice(0, 8)}@test.invalid` };
  let orgId = "";
  const slug = `status-${randomUUID().slice(0, 8)}`;
  const h = { authorization: `Bearer token:${owner.id}:aal2`, ...json };
  const call = (method: string, path: string, body?: unknown) => app.request(`/api/v1/orgs/${orgId}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const gw = new SimulatedStripeGateway("whsec_test_status", () => "http://localhost:3000", async (body, signature) => {
    await app.request("/api/v1/webhooks/stripe", { method: "POST", headers: { ...json, "stripe-signature": signature }, body });
  });
  const status = async () => ((await (await call("GET", "/integrations")).json()) as { items: { provider: string; status: string }[] }).items.find((i) => i.provider === "stripe")?.status;
  const checkout = () => app.request(`/api/v1/public/give/${slug}/checkout`, { method: "POST", headers: { ...json, "x-forwarded-for": `198.51.100.${randomUUID()}` }, body: JSON.stringify({ amount: 25 }) });

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
    orgId = ((await (await app.request("/api/v1/orgs", { method: "POST", headers: h, body: JSON.stringify({ name: "Kennebec Test Shelter" }) })).json()) as { id: string }).id;
  });

  afterAll(async () => {
    await db.execute(sql`delete from organizations where id = ${orgId}`);
    await db.execute(sql`delete from auth.users where id = ${owner.id}`);
    setStripeGateway(undefined);
    setVerifier(undefined);
    setDb(undefined);
  });

  it("shows needs more information until the account is ready, then takes gifts", async () => {
    // Connect an account that still owes Stripe details.
    const start = new URL(((await (await call("POST", "/integrations/stripe/connect")).json()) as { url: string }).url);
    const approve = await app.request("/api/v1/stripe-sim/connect", {
      method: "POST",
      headers: form,
      body: new URLSearchParams({ state: start.searchParams.get("state")!, redirect_uri: start.searchParams.get("redirect_uri")!, needs_info: "1" }).toString(),
    });
    const back = new URL(approve.headers.get("location")!);
    const done = (await (await call("POST", "/integrations/stripe/complete", { code: back.searchParams.get("code"), state: back.searchParams.get("state") })).json()) as { accountId: string; ready: boolean };
    expect(done.ready).toBe(false);
    expect(await status()).toBe("needs_info");

    // A giving page exists but does not take gifts yet.
    expect((await call("POST", "/donation-pages", { slug, title: "Help the animals" })).status).toBe(201);
    expect((await checkout()).status).toBe(409);

    // "Check again" agrees, and points at where to finish setup.
    const again = (await (await call("POST", "/integrations/stripe/refresh")).json()) as { ready: boolean; dashboardUrl: string };
    expect(again).toEqual({ ready: false, dashboardUrl: expect.stringContaining(`/stripe-sim/account/${done.accountId}`) });

    // The owner finishes setup in "Stripe", which sends account.updated.
    expect((await app.request(`/api/v1/stripe-sim/account/${done.accountId}`, { method: "POST" })).status).toBe(200);
    expect(await status()).toBe("connected");
    expect((await checkout()).status).toBe(200);
  });

  it("does not turn a disconnected account back on from a late event", async () => {
    expect((await call("DELETE", "/integrations/stripe")).status).toBe(204);
    expect((await call("POST", "/integrations/stripe/refresh")).status).toBe(409);
    expect(await status()).toBe("disconnected");
  });
});
