import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, userClaims, withRls, type Db } from "@maple/db";
import { app, setDb, setSupabaseAdmin, setVerifier } from "../src";

/**
 * Route matrix against a real database. Tokens are fake: the verifier is swapped
 * so "token:<userId>:<aal>" stands in for a Supabase JWT.
 */
const DATABASE_URL = process.env.DATABASE_URL;

type U = { id: string; email: string };

async function createUser(db: Db, label: string): Promise<U> {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@test.invalid`;
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${email}, '',
      now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  `);
  return { id, email };
}

const auth = (u: U, aal: "aal1" | "aal2" = "aal2") => ({ authorization: `Bearer token:${u.id}:${aal}` });
const json = { "content-type": "application/json" };

describe.skipIf(!DATABASE_URL)("api routes against the database", () => {
  let db: Db;
  let ownerA: U;
  let staffA: U;
  let ownerB: U;
  let orgA = "";
  let orgB = "";

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    setDb(db);
    setVerifier(async (token) => {
      const [, sub, aal] = token.split(":");
      if (!sub) throw new Error("bad token");
      return { sub, aal };
    });
    // Invitations would call Supabase Auth; stub the admin client.
    setSupabaseAdmin({ auth: { admin: { inviteUserByEmail: async () => ({ data: {}, error: null }) } } } as never);

    ownerA = await createUser(db, "owner-a");
    staffA = await createUser(db, "staff-a");
    ownerB = await createUser(db, "owner-b");

    const mk = async (u: U, name: string) => {
      const res = await app.request("/api/v1/orgs", { method: "POST", headers: { ...auth(u), ...json }, body: JSON.stringify({ name }) });
      expect(res.status).toBe(201);
      return ((await res.json()) as { id: string }).id;
    };
    orgA = await mk(ownerA, "Route Org A");
    orgB = await mk(ownerB, "Route Org B");
    await withRls(db, userClaims(ownerA.id, "aal2"), (tx) => tx.execute(sql`select * from app.invite_member(${orgA}, ${staffA.email}, 'staff')`));
  });

  afterAll(async () => {
    for (const id of [orgA, orgB]) await db.execute(sql`delete from organizations where id = ${id}`);
    for (const u of [ownerA, staffA, ownerB]) await db.execute(sql`delete from auth.users where id = ${u.id}`);
    setVerifier(undefined);
    setSupabaseAdmin(undefined);
    setDb(undefined);
  });

  it("lists only the caller's orgs", async () => {
    const res = await app.request("/api/v1/orgs", { headers: auth(ownerA) });
    const body = (await res.json()) as { orgs: { id: string; role: string }[] };
    expect(body.orgs.map((o) => o.id)).toEqual([orgA]);
    expect(body.orgs[0]?.role).toBe("owner");
  });

  it("hides org B from org A's people on every org route", async () => {
    for (const [method, path, body] of [
      ["GET", `/api/v1/orgs/${orgB}`, undefined],
      ["PATCH", `/api/v1/orgs/${orgB}`, { name: "Taken over", fiscalYearStartMonth: 1, timezone: "America/Chicago" }],
      ["GET", `/api/v1/orgs/${orgB}/members`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/members`, { email: "x@test.invalid", role: "staff" }],
      ["PATCH", `/api/v1/orgs/${orgB}/members/${randomUUID()}`, { role: "admin" }],
      ["POST", `/api/v1/orgs/${orgB}/members/${randomUUID()}/resend`, undefined],
      ["DELETE", `/api/v1/orgs/${orgB}/members/${randomUUID()}`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/transfer-ownership`, { toUserId: ownerA.id }],
      ["DELETE", `/api/v1/orgs/${orgB}`, undefined],
      ["GET", `/api/v1/orgs/${orgB}/constituents?q=a`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/constituents`, { lastName: "Intruder" }],
      ["GET", `/api/v1/orgs/${orgB}/constituents/${randomUUID()}`, undefined],
      ["GET", `/api/v1/orgs/${orgB}/coding/funds`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/coding/funds`, { name: "Sneaky" }],
      ["GET", `/api/v1/orgs/${orgB}/batches`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/batches`, { batchDate: "2026-01-01" }],
      ["POST", `/api/v1/orgs/${orgB}/gifts`, { constituentId: randomUUID(), amount: "5", giftDate: "2026-01-01", paymentMethod: "cash" }],
      ["GET", `/api/v1/orgs/${orgB}/gift-standards`, undefined],
      ["PUT", `/api/v1/orgs/${orgB}/gift-standards`, { requiredFields: [] }],
      ["GET", `/api/v1/orgs/${orgB}/health`, undefined],
      ["GET", `/api/v1/orgs/${orgB}/duplicates`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/duplicates/scan`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/merges`, { survivorId: randomUUID(), mergedId: randomUUID() }],
      ["GET", `/api/v1/orgs/${orgB}/merges`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/merges/${randomUUID()}/undo`, undefined],
      ["GET", `/api/v1/orgs/${orgB}/gifts?filter=unacknowledged`, undefined],
      ["GET", `/api/v1/orgs/${orgB}/imports`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/imports`, { kind: "constituents", fileName: "x.csv", headers: ["a"], expectedRows: 1 }],
      ["GET", `/api/v1/orgs/${orgB}/imports/${randomUUID()}`, undefined],
      ["GET", `/api/v1/orgs/${orgB}/imports/${randomUUID()}/coding`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/imports/${randomUUID()}/commit`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/imports/${randomUUID()}/rollback`, undefined],
      ["GET", `/api/v1/orgs/${orgB}/integrations`, undefined],
      ["GET", `/api/v1/orgs/${orgB}/integrations/health`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/integrations/events/${randomUUID()}/resolve`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/integrations/stripe/connect`, undefined],
      ["DELETE", `/api/v1/orgs/${orgB}/integrations/stripe`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/integrations/stripe/simulate-payout`, undefined],
      ["PUT", `/api/v1/orgs/${orgB}/integrations/mailchimp/key`, { apiKey: "sim-key-intruder-us1" }],
      ["GET", `/api/v1/orgs/${orgB}/integrations/mailchimp/audiences`, undefined],
      ["PATCH", `/api/v1/orgs/${orgB}/integrations/mailchimp/config`, { listId: "x", permissionConfirmed: true }],
      ["POST", `/api/v1/orgs/${orgB}/integrations/mailchimp/sync`, undefined],
      ["DELETE", `/api/v1/orgs/${orgB}/integrations/mailchimp`, undefined],
      ["GET", `/api/v1/orgs/${orgB}/donation-pages`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/donation-pages`, { slug: `intruder-${randomUUID().slice(0, 8)}`, title: "Sneaky" }],
      ["GET", `/api/v1/orgs/${orgB}/donation-pages/${randomUUID()}`, undefined],
      ["PUT", `/api/v1/orgs/${orgB}/donation-pages/${randomUUID()}`, { slug: "intruder-page", title: "Sneaky" }],
      ["DELETE", `/api/v1/orgs/${orgB}/donation-pages/${randomUUID()}`, undefined],
      ["GET", `/api/v1/orgs/${orgB}/accounting`, undefined],
      ["PUT", `/api/v1/orgs/${orgB}/accounting`, { depositAccount: "Sneaky" }],
      ["GET", `/api/v1/orgs/${orgB}/accounting/export?from=2026-01-01&to=2026-12-31`, undefined],
      ["GET", `/api/v1/orgs/${orgB}/billing`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/billing/checkout`, undefined],
      ["POST", `/api/v1/orgs/${orgB}/billing/portal`, undefined],
      ["GET", `/api/v1/orgs/${orgB}/export/everything`, undefined],
    ] as const) {
      const res = await app.request(path, { method, headers: { ...auth(ownerA), ...json }, body: body ? JSON.stringify(body) : undefined });
      // Reads of a foreign org are empty or not found, never a leak; writes are refused.
      const allowed = method === "GET" && (path.includes("/constituents?") || path.includes("/coding/") || path.endsWith("/batches") || path.endsWith("/health") || path.endsWith("/duplicates") || path.endsWith("/merges") || path.includes("/gifts?") || path.endsWith("/imports") || path.endsWith("/integrations") || path.endsWith("/integrations/health") || path.endsWith("/donation-pages")) ? [200, 403, 404] : [403, 404];
      expect(allowed, `${method} ${path} -> ${res.status}`).toContain(res.status);
      const text = await res.text();
      if (res.status === 200) expect(text).toMatch(/"items":\[\]|"total":0|"constituents":0|"integrations":\[\]/);
      expect(text).not.toContain(orgB);
      expect(text).not.toContain("Route Org B");
    }
  });

  it("owners save the organization's details; staff cannot; bad EIN and ZIP get plain errors", async () => {
    const body = { name: "Route Org A", ein: "123456789", address: { line1: "100 Main St", city: "Springfield", state: "il", postalCode: "62701" }, fiscalYearStartMonth: 7, timezone: "America/Chicago" };
    const ok = await app.request(`/api/v1/orgs/${orgA}`, { method: "PATCH", headers: { ...auth(ownerA), ...json }, body: JSON.stringify(body) });
    expect(ok.status).toBe(200);
    const org = (await (await app.request(`/api/v1/orgs/${orgA}`, { headers: auth(ownerA) })).json()) as { ein: string; address: Record<string, string>; fiscalYearStartMonth: number; timezone: string };
    expect(org).toMatchObject({ ein: "12-3456789", fiscalYearStartMonth: 7, timezone: "America/Chicago", address: { line1: "100 Main St", state: "IL", postalCode: "62701" } });
    const staff = await app.request(`/api/v1/orgs/${orgA}`, { method: "PATCH", headers: { ...auth(staffA), ...json }, body: JSON.stringify(body) });
    expect(staff.status).toBe(403);
    const bad = await app.request(`/api/v1/orgs/${orgA}`, { method: "PATCH", headers: { ...auth(ownerA), ...json }, body: JSON.stringify({ ...body, ein: "12-34", address: { postalCode: "abc" } }) });
    expect(bad.status).toBe(400);
    const issues = ((await bad.json()) as { issues: { message: string }[] }).issues.map((i) => i.message);
    expect(issues).toEqual(expect.arrayContaining(["An EIN looks like 12-3456789", "A ZIP code looks like 62701"]));
    // Clearing the EIN is allowed.
    const cleared = await app.request(`/api/v1/orgs/${orgA}`, { method: "PATCH", headers: { ...auth(ownerA), ...json }, body: JSON.stringify({ ...body, ein: "" }) });
    expect(cleared.status).toBe(200);
  });

  it("staff can see members but cannot invite, and MFA is required to invite", async () => {
    const list = await app.request(`/api/v1/orgs/${orgA}/members`, { headers: auth(staffA) });
    expect(list.status).toBe(200);
    const members = ((await list.json()) as { members: { email: string; role: string }[] }).members;
    expect(members.map((m) => m.role)).toEqual(["owner", "staff"]);

    const asStaff = await app.request(`/api/v1/orgs/${orgA}/members`, { method: "POST", headers: { ...auth(staffA), ...json }, body: JSON.stringify({ email: "new@test.invalid", role: "staff" }) });
    expect(asStaff.status).toBe(403);
    const noMfa = await app.request(`/api/v1/orgs/${orgA}/members`, { method: "POST", headers: { ...auth(ownerA, "aal1"), ...json }, body: JSON.stringify({ email: "new@test.invalid", role: "staff" }) });
    expect(noMfa.status).toBe(403);
  });

  it("owner invites, changes a role, and removes a member", async () => {
    const invite = await app.request(`/api/v1/orgs/${orgA}/members`, { method: "POST", headers: { ...auth(ownerA), ...json }, body: JSON.stringify({ email: "Pending@Test.invalid", role: "board_viewer" }) });
    expect(invite.status).toBe(201);
    const { membershipId, status } = (await invite.json()) as { membershipId: string; status: string };
    expect(status).toBe("invited");

    const again = await app.request(`/api/v1/orgs/${orgA}/members`, { method: "POST", headers: { ...auth(ownerA), ...json }, body: JSON.stringify({ email: "pending@test.invalid", role: "staff" }) });
    expect(again.status).toBe(409);

    const patch = await app.request(`/api/v1/orgs/${orgA}/members/${membershipId}`, { method: "PATCH", headers: { ...auth(ownerA), ...json }, body: JSON.stringify({ role: "staff" }) });
    expect(patch.status).toBe(200);

    const del = await app.request(`/api/v1/orgs/${orgA}/members/${membershipId}`, { method: "DELETE", headers: auth(ownerA) });
    expect(del.status).toBe(204);
  });

  it("only the owner can transfer ownership, and afterwards roles are swapped", async () => {
    const denied = await app.request(`/api/v1/orgs/${orgA}/transfer-ownership`, { method: "POST", headers: { ...auth(staffA), ...json }, body: JSON.stringify({ toUserId: staffA.id }) });
    expect(denied.status).toBe(403);
    const noMfa = await app.request(`/api/v1/orgs/${orgA}/transfer-ownership`, { method: "POST", headers: { ...auth(ownerA, "aal1"), ...json }, body: JSON.stringify({ toUserId: staffA.id }) });
    expect(noMfa.status).toBe(403);

    const ok = await app.request(`/api/v1/orgs/${orgA}/transfer-ownership`, { method: "POST", headers: { ...auth(ownerA), ...json }, body: JSON.stringify({ toUserId: staffA.id, reason: "handing over" }) });
    expect(ok.status).toBe(200);

    const list = await app.request(`/api/v1/orgs/${orgA}/members`, { headers: auth(staffA) });
    const members = ((await list.json()) as { members: { userId: string; role: string }[] }).members;
    expect(members.find((m) => m.userId === staffA.id)?.role).toBe("owner");
    expect(members.find((m) => m.userId === ownerA.id)?.role).toBe("admin");

    // Hand it back so the rest of the file sees the original roles.
    const back = await app.request(`/api/v1/orgs/${orgA}/transfer-ownership`, { method: "POST", headers: { ...auth(staffA), ...json }, body: JSON.stringify({ toUserId: ownerA.id }) });
    expect(back.status).toBe(200);
    // The former owner is an admin now, not staff. Put them back.
    const row = await withRls(db, userClaims(ownerA.id, "aal2"), async (tx) => (await tx.execute(sql`select id from org_memberships where org_id = ${orgA} and user_id = ${staffA.id}`))[0] as { id: string });
    const reset = await app.request(`/api/v1/orgs/${orgA}/members/${row.id}`, { method: "PATCH", headers: { ...auth(ownerA), ...json }, body: JSON.stringify({ role: "staff" }) });
    expect(reset.status).toBe(200);
  });

  it("staff enters a batch of gifts against the standards and an admin posts it", async () => {
    const h = (u: U, aal: "aal1" | "aal2" = "aal2") => ({ ...auth(u, aal), ...json });
    const post = async (u: U, path: string, body: unknown, aal: "aal1" | "aal2" = "aal2") =>
      app.request(path, { method: "POST", headers: h(u, aal), body: JSON.stringify(body) });

    // Standards: campaign required, check numbers required for checks.
    const std = await app.request(`/api/v1/orgs/${orgA}/gift-standards`, { method: "PUT", headers: h(ownerA), body: JSON.stringify({ requiredFields: ["campaignId"], fieldInstructions: { campaignId: "Pick the mailing this came from." } }) });
    expect(std.status).toBe(200);
    const stdByStaff = await app.request(`/api/v1/orgs/${orgA}/gift-standards`, { method: "PUT", headers: h(staffA), body: JSON.stringify({ requiredFields: [] }) });
    expect(stdByStaff.status).toBe(403);

    const fund = ((await (await post(staffA, `/api/v1/orgs/${orgA}/coding/funds`, { name: "General", code: "GEN" })).json()) as { id: string }).id;
    const campaign = ((await (await post(staffA, `/api/v1/orgs/${orgA}/coding/campaigns`, { name: "Spring appeal", goalAmount: "5000" })).json()) as { id: string }).id;

    const donorRes = await post(staffA, `/api/v1/orgs/${orgA}/constituents`, {
      firstName: "Dana", lastName: "Rivera", emails: [{ email: "Dana@Example.org", isPrimary: true }], phones: [{ phone: "555-010-2233" }],
      addresses: [{ line1: "12 Elm St", city: "Springfield", state: "IL", postalCode: "62701" }],
    });
    expect(donorRes.status).toBe(201);
    const donor = ((await donorRes.json()) as { id: string }).id;

    const dup = await app.request(`/api/v1/orgs/${orgA}/constituents/duplicates?firstName=D&lastName=Rivera&email=dana@example.org`, { headers: auth(staffA) });
    const { candidates } = (await dup.json()) as { candidates: { id: string; reasons: string[] }[] };
    expect(candidates[0]?.id).toBe(donor);
    expect(candidates[0]?.reasons).toContain("same email");

    const found = (await (await app.request(`/api/v1/orgs/${orgA}/constituents?q=riv`, { headers: auth(staffA) })).json()) as { items: { id: string }[]; total: number };
    expect(found.items.map((i) => i.id)).toEqual([donor]);

    const tagRes = await post(staffA, `/api/v1/orgs/${orgA}/tags`, { name: "Board" });
    const tagId = ((await tagRes.json()) as { id: string }).id;
    const setTags = await app.request(`/api/v1/orgs/${orgA}/constituents/${donor}/tags`, { method: "PUT", headers: h(staffA), body: JSON.stringify({ tagIds: [tagId] }) });
    expect(setTags.status).toBe(200);
    const clearTags = await app.request(`/api/v1/orgs/${orgA}/constituents/${donor}/tags`, { method: "PUT", headers: h(staffA), body: JSON.stringify({ tagIds: [] }) });
    expect(clearTags.status).toBe(200);

    const detail = (await (await app.request(`/api/v1/orgs/${orgA}/constituents/${donor}`, { headers: auth(staffA) })).json()) as { displayName: string; emails: { email: string; isPrimary: boolean }[] };
    expect(detail.displayName).toBe("Dana Rivera");
    expect(detail.emails[0]?.email).toBe("dana@example.org");

    const batch = ((await (await post(staffA, `/api/v1/orgs/${orgA}/batches`, { batchDate: "2026-03-02", description: "Monday deposit", expectedTotal: "300", expectedCount: 3 })).json()) as { id: string }).id;

    // A check without a number, and a gift without the required campaign, are refused with field issues.
    const bad = await post(staffA, `/api/v1/orgs/${orgA}/gifts`, { constituentId: donor, batchId: batch, amount: "100", giftDate: "2026-03-02", fundId: fund, paymentMethod: "check" });
    expect(bad.status).toBe(400);
    const issues = ((await bad.json()) as { issues: { path: string }[] }).issues.map((i) => i.path).sort();
    expect(issues).toEqual(["campaignId", "checkNumber"]);

    for (const n of [1, 2, 3]) {
      const ok = await post(staffA, `/api/v1/orgs/${orgA}/gifts`, { constituentId: donor, batchId: batch, amount: "100", giftDate: "2026-03-02", fundId: fund, campaignId: campaign, paymentMethod: "check", checkNumber: `20${n}` });
      expect(ok.status).toBe(201);
    }

    const staffPost = await post(staffA, `/api/v1/orgs/${orgA}/batches/${batch}/post`, {});
    expect(staffPost.status).toBe(403);
    const noMfa = await post(ownerA, `/api/v1/orgs/${orgA}/batches/${batch}/post`, {}, "aal1");
    expect(noMfa.status).toBe(403);
    const posted = await post(ownerA, `/api/v1/orgs/${orgA}/batches/${batch}/post`, {});
    expect(posted.status).toBe(200);
    expect(await posted.json()).toEqual({ postedCount: 3, postedTotal: "300.00" });

    const after = (await (await app.request(`/api/v1/orgs/${orgA}/batches/${batch}`, { headers: auth(staffA) })).json()) as { status: string; gifts: { postedAt: string | null }[] };
    expect(after.status).toBe(posted ? "posted" : "open");
    expect(after.gifts.every((g) => g.postedAt)).toBe(true);

    const audit = (await (await app.request(`/api/v1/orgs/${orgA}/constituents/${donor}/audit`, { headers: auth(staffA) })).json()) as { items: { action: string }[] };
    expect(audit.items.map((a) => a.action)).toEqual(["insert"]);
    const giftAudit = (await (await app.request(`/api/v1/orgs/${orgA}/gifts/${(after as unknown as { gifts: { id: string }[] }).gifts[0]!.id}/audit`, { headers: auth(staffA) })).json()) as { items: { action: string; actorName: string | null }[] };
    expect(giftAudit.items.map((a) => a.action)).toEqual(["update", "insert"]);

    // Mismatched totals explain themselves.
    const batch2 = ((await (await post(staffA, `/api/v1/orgs/${orgA}/batches`, { batchDate: "2026-03-03", expectedTotal: "50" })).json()) as { id: string }).id;
    await post(staffA, `/api/v1/orgs/${orgA}/gifts`, { constituentId: donor, batchId: batch2, amount: "40", giftDate: "2026-03-03", fundId: fund, campaignId: campaign, paymentMethod: "cash" });
    const mismatch = await post(ownerA, `/api/v1/orgs/${orgA}/batches/${batch2}/post`, {});
    expect(mismatch.status).toBe(400);
    expect(((await mismatch.json()) as { error: string }).error).toMatch(/but the deposit slip says \$[0-9,.]+\. That is \$[0-9,.]+ (short|over)/);
  });

  it("scans duplicates, merges a pair, and undoes the merge through the API", async () => {
    const h = (u: U) => ({ ...auth(u), ...json });
    const mk = async (body: unknown) => ((await (await app.request(`/api/v1/orgs/${orgA}/constituents`, { method: "POST", headers: h(staffA), body: JSON.stringify(body) })).json()) as { id: string }).id;
    const first = await mk({ firstName: "Priya", lastName: "Natarajan", emails: [{ email: "priya@example.org" }] });
    const second = await mk({ firstName: "P.", lastName: "Natarajan", emails: [{ email: "PRIYA@example.org" }], phones: [{ phone: "217-555-0150" }] });

    const scan = await app.request(`/api/v1/orgs/${orgA}/duplicates/scan`, { method: "POST", headers: auth(staffA) });
    expect(scan.status).toBe(200);
    const list = (await (await app.request(`/api/v1/orgs/${orgA}/duplicates`, { headers: auth(staffA) })).json()) as { items: { id: string; reasons: string[]; a: { id: string }; b: { id: string } }[] };
    const pair = list.items.find((p) => [p.a.id, p.b.id].includes(first) && [p.a.id, p.b.id].includes(second));
    expect(pair?.reasons).toContain("same email");

    const health = (await (await app.request(`/api/v1/orgs/${orgA}/health`, { headers: auth(staffA) })).json()) as { openDuplicates: number };
    expect(health.openDuplicates).toBeGreaterThanOrEqual(1);

    const staffMerge = await app.request(`/api/v1/orgs/${orgA}/merges`, { method: "POST", headers: h(staffA), body: JSON.stringify({ survivorId: first, mergedId: second }) });
    expect(staffMerge.status).toBe(403);
    const merged = await app.request(`/api/v1/orgs/${orgA}/merges`, { method: "POST", headers: h(ownerA), body: JSON.stringify({ survivorId: first, mergedId: second, decisions: { first_name: "a" } }) });
    expect(merged.status).toBe(201);
    const { mergeId } = (await merged.json()) as { mergeId: string };

    const gone = await app.request(`/api/v1/orgs/${orgA}/constituents/${second}`, { headers: auth(staffA) });
    expect(gone.status).toBe(404);
    const survivor = (await (await app.request(`/api/v1/orgs/${orgA}/constituents/${first}`, { headers: auth(staffA) })).json()) as { phones: unknown[] };
    expect(survivor.phones).toHaveLength(1);

    const merges = (await (await app.request(`/api/v1/orgs/${orgA}/merges`, { headers: auth(staffA) })).json()) as { items: { id: string; reversedAt: string | null }[] };
    expect(merges.items.find((m) => m.id === mergeId)?.reversedAt).toBeNull();

    const undo = await app.request(`/api/v1/orgs/${orgA}/merges/${mergeId}/undo`, { method: "POST", headers: auth(ownerA) });
    expect(undo.status).toBe(200);
    const back = await app.request(`/api/v1/orgs/${orgA}/constituents/${second}`, { headers: auth(staffA) });
    expect(back.status).toBe(200);

    for (const id of [first, second]) await app.request(`/api/v1/orgs/${orgA}/constituents/${id}`, { method: "DELETE", headers: auth(ownerA) });
  });

  it("creates one sample org per person and removes it", async () => {
    const a = await app.request("/api/v1/orgs/sample", { method: "POST", headers: auth(staffA) });
    expect(a.status).toBe(201);
    const { id } = (await a.json()) as { id: string };
    const b = await app.request("/api/v1/orgs/sample", { method: "POST", headers: auth(staffA) });
    expect(((await b.json()) as { id: string }).id).toBe(id);

    const realDelete = await app.request(`/api/v1/orgs/${orgA}`, { method: "DELETE", headers: auth(ownerA) });
    expect(realDelete.status).toBe(403);
    const del = await app.request(`/api/v1/orgs/${id}`, { method: "DELETE", headers: auth(staffA) });
    expect(del.status).toBe(204);
  });
});
