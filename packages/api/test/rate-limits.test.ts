import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, withPublic, type Db } from "@maple/db";
import { hitRateLimit, RATE_LIMITS } from "@maple/core/services";
import { app, setDb, setMailer, setTurnstileVerifier, setVerifier } from "../src";

/**
 * Launch review, must fix 3: rate limits on public checkout, board links and bulk email,
 * and the bot check on giving pages. Slugs, addresses and the organization are new for each
 * run, so counts from earlier runs never matter.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const json = { "content-type": "application/json" };
const run = randomUUID().slice(0, 8);
const ip = (n: number) => `203.0.113.${n}-${run}`;

const checkout = (slug: string, from: string, body: Record<string, unknown> = {}) =>
  app.request(`/api/v1/public/give/${slug}/checkout`, {
    method: "POST",
    headers: { ...json, "x-forwarded-for": from },
    body: JSON.stringify({ amount: 25, ...body }),
  });

describe.skipIf(!DATABASE_URL)("rate limits and the bot check", () => {
  let db: Db;
  const owner = { id: randomUUID(), email: `rl-owner-${run}@test.invalid` };
  let orgId = "";
  const mail: { to: string; subject: string }[] = [];

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    setDb(db);
    setVerifier(async (token) => {
      const [, sub, aal] = token.split(":");
      return { sub, aal };
    });
    setMailer({ from: "test", send: async (m) => void mail.push(m) });
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (${owner.id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${owner.email}, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())`);
    const res = await app.request("/api/v1/orgs", { method: "POST", headers: { authorization: `Bearer token:${owner.id}:aal2`, ...json }, body: JSON.stringify({ name: "Rate Limit Rescue" }) });
    orgId = ((await res.json()) as { id: string }).id;
  });

  afterEach(() => setTurnstileVerifier(undefined));

  afterAll(async () => {
    await db.execute(sql`delete from rate_limit_hits where bucket like ${`%${run}%`} or bucket = ${`bulkEmailOrg:${orgId}`}`);
    await db.execute(sql`delete from donation_pages where org_id = ${orgId}`);
    await db.execute(sql`delete from organizations where id = ${orgId}`);
    await db.execute(sql`delete from auth.users where id = ${owner.id}`);
    setVerifier(undefined);
    setDb(undefined);
  });

  it("stops one visitor after 10 checkouts in 10 minutes", async () => {
    const slug = `rl-visitor-${run}`;
    for (let i = 0; i < RATE_LIMITS.checkoutVisitor.limit; i++) {
      // No such page, so each try gets as far as the page lookup and stops there.
      expect((await checkout(slug, ip(1))).status).toBe(404);
    }
    const over = await checkout(slug, ip(1));
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).toBe("600");
    expect(((await over.json()) as { code: string }).code).toBe("rate_limited");
    // Someone else is not affected.
    expect((await checkout(slug, ip(2))).status).toBe(404);
  });

  it("stops a burst spread across many visitors on one page", async () => {
    const slug = `rl-page-${run}`;
    for (let i = 0; i < RATE_LIMITS.checkoutPage.limit; i++) {
      expect((await checkout(slug, `${ip(3)}-${i}`)).status).toBe(404);
    }
    expect((await checkout(slug, ip(4))).status).toBe(429);
    // Another page is not affected.
    expect((await checkout(`${slug}-b`, ip(4))).status).toBe(404);
  });

  it("warns the owner once when a real giving page hits its limit", async () => {
    const slug = `rl-alert-${run}`;
    const made = await app.request(`/api/v1/orgs/${orgId}/donation-pages`, { method: "POST", headers: { authorization: `Bearer token:${owner.id}:aal2`, ...json }, body: JSON.stringify({ slug, title: "Spring appeal" }) });
    expect(made.status).toBe(201);
    mail.length = 0;
    for (let i = 0; i < RATE_LIMITS.checkoutPage.limit; i++) {
      // The page is not taking gifts (no Stripe), which is fine: every try still counts.
      expect((await checkout(slug, `${ip(7)}-${i}`)).status).toBe(409);
    }
    expect(mail).toHaveLength(0);
    expect((await checkout(slug, ip(8))).status).toBe(429);
    expect((await checkout(slug, ip(9))).status).toBe(429);
    expect(mail).toEqual([expect.objectContaining({ to: owner.email, subject: 'Unusual activity on your giving page "Spring appeal"' })]);
  });

  it("refuses a checkout that fails the bot check, before looking up the page", async () => {
    const seen: (string | undefined)[] = [];
    setTurnstileVerifier(async (token) => {
      seen.push(token);
      return token === "good";
    });
    const bad = await checkout(`rl-bot-${run}`, ip(5), { botCheck: "bad" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { code: string }).code).toBe("bot_check_failed");
    expect((await checkout(`rl-bot-${run}`, ip(5))).status).toBe(400);
    expect((await checkout(`rl-bot-${run}`, ip(5), { botCheck: "good" })).status).toBe(404);
    expect(seen).toEqual(["bad", undefined, "good"]);
  });

  it("pauses giving in production when the bot check has no key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("INTEGRATIONS_KEY", Buffer.alloc(32, 7).toString("base64"));
    try {
      const r = await checkout(`rl-prod-${run}`, ip(6));
      expect(r.status).toBe(503);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("limits board link views per visitor", async () => {
    const key = `board-${run}`;
    const results = await withPublic(db, async (tx) => {
      const out: boolean[] = [];
      for (let i = 0; i <= RATE_LIMITS.boardVisitor.limit; i++) out.push(await hitRateLimit(tx, "boardVisitor", key));
      return out;
    });
    expect(results.filter(Boolean)).toHaveLength(RATE_LIMITS.boardVisitor.limit);
    expect(results.at(-1)).toBe(false);
  });

  it("limits bulk statement emails per organization, counting members only", async () => {
    const year = new Date().getUTCFullYear() - 1;
    const send = (who: string) =>
      app.request(`/api/v1/orgs/${orgId}/statements/${year}/email`, { method: "POST", headers: { authorization: `Bearer token:${who}:aal2`, ...json }, body: "{}" });
    // A stranger is refused and does not use up the organization's sends.
    expect((await send(randomUUID())).status).toBe(403);
    for (let i = 0; i < RATE_LIMITS.bulkEmailOrg.limit; i++) expect((await send(owner.id)).status).toBe(200);
    const over = await send(owner.id);
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).toBe("3600");
  });

  it("keeps the counts out of reach of signed-out visitors", async () => {
    const err = await withPublic(db, (tx) => tx.execute(sql`select count(*) from rate_limit_hits`)).catch((e) => e as { cause?: { code?: string } });
    expect((err as { cause?: { code?: string } }).cause?.code).toBe("42501");
  });
});
