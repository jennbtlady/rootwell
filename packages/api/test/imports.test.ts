import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@maple/db";
import { app, setDb, setVerifier } from "../src";
import { HEADERS, bigFile, messyFile } from "./fixtures/import-fixture";

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

describe.skipIf(!DATABASE_URL)("import wizard through the API", () => {
  let db: Db;
  let owner: U;
  let staff: U;
  let orgId = "";
  const h = (u: U, aal = "aal2") => ({ authorization: `Bearer token:${u.id}:${aal}`, ...json });
  const call = (u: U, method: string, path: string, body?: unknown) => app.request(`/api/v1/orgs/${orgId}${path}`, { method, headers: h(u), body: body ? JSON.stringify(body) : undefined });

  async function upload(kind: string, fileName: string, rows: string[][]) {
    const res = await call(owner, "POST", "/imports", { kind, fileName, headers: HEADERS, expectedRows: rows.length });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    for (let i = 0; i < rows.length; i += 500) {
      const r = await call(owner, "POST", `/imports/${id}/rows`, { offset: i, rows: rows.slice(i, i + 500) });
      expect(r.status).toBe(200);
    }
    return id;
  }
  const mapping = { legacy_id: "Donor ID", first_name: "First Name", last_name: "Last Name", email: "Email", phone: "Phone", line1: "Address", city: "City", state: "State", postal_code: "Zip", amount: "Amount", gift_date: "Date", fund: "Fund", campaign: "Campaign", payment_method: "Method", check_number: "Check No" };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    setDb(db);
    setVerifier(async (token) => {
      const [, sub, aal] = token.split(":");
      return { sub, aal };
    });
    owner = await createUser(db, "imp-owner");
    staff = await createUser(db, "imp-staff");
    const res = await app.request("/api/v1/orgs", { method: "POST", headers: h(owner), body: JSON.stringify({ name: "Import Org" }) });
    orgId = ((await res.json()) as { id: string }).id;
    await db.execute(sql`insert into org_memberships (org_id, user_id, role, status, accepted_at) values (${orgId}, ${staff.id}, 'staff', 'active', now())`);
    // One existing donor the file should match by email.
    await call(owner, "POST", "/constituents", { firstName: "Marcus", lastName: "Chen", emails: [{ email: "marcus.m1@example.org" }] });
  });

  afterAll(async () => {
    await db.execute(sql`delete from organizations where id = ${orgId}`);
    for (const u of [owner, staff]) await db.execute(sql`delete from auth.users where id = ${u.id}`);
    setVerifier(undefined);
    setDb(undefined);
  });

  it("staff cannot start an import", async () => {
    const res = await call(staff, "POST", "/imports", { kind: "constituents", fileName: "x.csv", headers: ["a"], expectedRows: 1 });
    expect(res.status).toBe(403);
  });

  it("a messy file: errors per row, fix in place, skip, review, commit, rollback", async () => {
    const id = await upload("constituents_gifts", "messy.csv", messyFile("m1"));
    const prep = await call(owner, "PUT", `/imports/${id}/mapping`, { mapping, saveAs: "Our old spreadsheet" });
    expect(prep.status).toBe(200);
    const job = (await prep.json()) as { status: string; counts: Record<string, number>; people: Record<string, number> };
    expect(job.status).toBe("ready");

    const errs = (await (await call(owner, "GET", `/imports/${id}/rows?action=error`)).json()) as { items: { rowNumber: number; errors: { field: string }[] }[] };
    const byRow = Object.fromEntries(errs.items.map((r) => [r.rowNumber, r.errors.map((e) => e.field).sort()]));
    expect(byRow[4]).toEqual(["email"]);
    expect(byRow[5]).toEqual(["amount"]);
    expect(byRow[6]).toEqual(["gift_date"]);
    expect(byRow[10]).toEqual(["amount"]);
    expect(byRow[12]).toEqual(["gift_date"]);
    expect(Object.keys(byRow).map(Number).sort((a, b) => a - b)).toEqual([4, 5, 6, 10, 12]);

    // Warnings: short phone dropped, unknown payment method.
    const warn = (await (await call(owner, "GET", `/imports/${id}/rows?warnings=true`)).json()) as { items: { rowNumber: number }[] };
    expect(warn.items.map((r) => r.rowNumber).sort((a, b) => a - b)).toEqual([5, 9]);

    // Fix the email in place; skip the rest of the errors.
    const fix = await call(owner, "PATCH", `/imports/${id}/rows/4`, { fields: { email: "tom.m1@example.org" } });
    expect(((await fix.json()) as { action: string }).action).toBe("create");
    const skipped = (await (await call(owner, "POST", `/imports/${id}/skip-errors`)).json()) as { skipped: number };
    expect(skipped.skipped).toBe(4);

    // Dana appears twice in the file (email case differs): one person, two gifts.
    const created = (await (await call(owner, "GET", `/imports/${id}/people?scope=create`)).json()) as { items: { personKey: string; rowCount: number; giftTotal: string }[] };
    const dana = created.items.find((p) => p.personKey === "email:dana.m1@example.org");
    expect(dana).toMatchObject({ rowCount: 2, giftTotal: "150.00" });

    // Marcus matches the existing record by email automatically.
    const matched = (await (await call(owner, "GET", `/imports/${id}/people?scope=match`)).json()) as { items: { personKey: string }[] };
    expect(matched.items.map((p) => p.personKey)).toEqual(["email:marcus.m1@example.org"]);

    // Committing with nothing left to decide.
    const review = (await (await call(owner, "GET", `/imports/${id}/people?scope=review`)).json()) as { total: number };
    if (review.total) await call(owner, "POST", `/imports/${id}/decisions`, { all: "create" });
    const noMfa = await app.request(`/api/v1/orgs/${orgId}/imports/${id}/commit`, { method: "POST", headers: h(owner, "aal1") });
    expect(noMfa.status).toBe(403);
    const commit = await call(owner, "POST", `/imports/${id}/commit`);
    expect(commit.status).toBe(200);
    const summary = (await commit.json()) as Record<string, number>;
    expect(summary).toMatchObject({ peopleMatched: 1, fundsCreated: 2, campaignsCreated: 2 });

    const counts = await db.execute(sql`select (select count(*) from constituents where org_id = ${orgId})::int as people, (select count(*) from gifts where org_id = ${orgId})::int as gifts, (select count(*) from gifts where org_id = ${orgId} and posted_at is not null)::int as posted`);
    const c = counts[0] as { people: number; gifts: number; posted: number };
    expect(c.gifts).toBe(summary.gifts);
    expect(c.posted).toBe(c.gifts);

    const saved = (await (await call(owner, "GET", "/import-mappings")).json()) as { items: { name: string }[] };
    expect(saved.items.map((m) => m.name)).toContain("Our old spreadsheet");

    // Rollback removes everything it created; Marcus, who existed before, stays.
    const rb = await call(owner, "POST", `/imports/${id}/rollback`);
    expect(rb.status).toBe(200);
    const after = await db.execute(sql`
      select (select count(*) from constituents where org_id = ${orgId})::int as people,
             (select count(*) from gifts where org_id = ${orgId})::int as gifts,
             (select count(*) from funds where org_id = ${orgId})::int as funds,
             (select count(*) from campaigns where org_id = ${orgId})::int as campaigns,
             (select count(*) from batches where org_id = ${orgId})::int as batches`);
    expect(after[0]).toEqual({ people: 1, gifts: 0, funds: 0, campaigns: 0, batches: 0 });
  });

  it("5,000 rows of constituents plus gifts import in under two minutes, and rollback removes every created row", async () => {
    const started = Date.now();
    const rows = bigFile(5000, 11, "big");
    const id = await upload("constituents_gifts", "big.csv", rows);
    const prep = await call(owner, "PUT", `/imports/${id}/mapping`, { mapping });
    expect(prep.status).toBe(200);
    const job = (await prep.json()) as { counts: Record<string, number> };
    expect(job.counts.error).toBe(0);
    // Duplicate review step: every person in this file is new, so nothing should need a decision.
    const review = (await (await call(owner, "GET", `/imports/${id}/people?scope=review`)).json()) as { total: number };
    if (review.total) await call(owner, "POST", `/imports/${id}/decisions`, { all: "create" });
    const commit = await call(owner, "POST", `/imports/${id}/commit`);
    expect(commit.status).toBe(200);
    const summary = (await commit.json()) as Record<string, number>;
    const seconds = (Date.now() - started) / 1000;
    console.log(`5,000-row import: ${seconds.toFixed(1)}s, ${summary.peopleCreated} people, ${summary.gifts} gifts`);
    expect(summary.gifts).toBe(5000);
    expect(seconds).toBeLessThan(120);

    const rb = await call(owner, "POST", `/imports/${id}/rollback`);
    expect(rb.status).toBe(200);
    const after = await db.execute(sql`select (select count(*) from gifts where org_id = ${orgId})::int as gifts, (select count(*) from constituents where org_id = ${orgId})::int as people`);
    expect(after[0]).toEqual({ gifts: 0, people: 1 });
  }, 240_000);
});
