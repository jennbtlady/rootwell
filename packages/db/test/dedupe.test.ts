import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, cleanup, createOrgWithTeam, errorCode, hasDb, makeDb, type TestOrg } from "./helpers";
import type { Db } from "../src";

type Row = Record<string, unknown>;
const one = async <T = Row>(p: Promise<Row[]>): Promise<T> => (await p)[0] as T;

/**
 * A deliberately messy fixture: the same person entered three ways, a phone-only match,
 * a last-name-and-ZIP match, and two people who are not duplicates despite sharing a
 * last name. Then a merge, and its undo.
 */
describe.skipIf(!hasDb)("phase 2: duplicates, merge, undo", () => {
  let db: Db;
  let a: TestOrg;
  const ids: Record<string, string> = {};
  let fund = "";
  let mergeId = "";

  async function person(key: string, fields: { first: string; last: string; email?: string; phone?: string; line1?: string; postal?: string; notes?: string }) {
    await as(db, a.staff, async (tx) => {
      const id = (await one<{ id: string }>(tx.execute(sql`insert into constituents (org_id, first_name, last_name, notes) values (${a.id}, ${fields.first}, ${fields.last}, ${fields.notes ?? null}) returning id`))).id;
      ids[key] = id;
      if (fields.email) await tx.execute(sql`insert into constituent_emails (org_id, constituent_id, email, is_primary) values (${a.id}, ${id}, ${fields.email}, true)`);
      if (fields.phone) await tx.execute(sql`insert into constituent_phones (org_id, constituent_id, phone, is_primary) values (${a.id}, ${id}, ${fields.phone}, true)`);
      if (fields.line1 || fields.postal) await tx.execute(sql`insert into constituent_addresses (org_id, constituent_id, line1, postal_code, is_primary) values (${a.id}, ${id}, ${fields.line1 ?? null}, ${fields.postal ?? null}, true)`);
    });
  }

  beforeAll(async () => {
    db = makeDb();
    a = await createOrgWithTeam(db, "Dedupe Org");
    fund = await as(db, a.staff, async (tx) => (await one<{ id: string }>(tx.execute(sql`insert into funds (org_id, name) values (${a.id}, 'General') returning id`))).id);

    await person("dana1", { first: "Danielle", last: "Rivera", email: "dana.rivera@example.org", phone: "217-555-0100", line1: "12 Elm St", postal: "62701", notes: "Prefers mail." });
    await person("dana2", { first: "Dana", last: "Rivera", email: "DANA.RIVERA@example.org", line1: "12 Elm Street", postal: "62701-4411" });
    await person("dana3", { first: "D.", last: "Rivera", phone: "(217) 555-0100" });
    await person("marco", { first: "Marco", last: "Rivera", line1: "90 Oak Ave", postal: "62701" });
    await person("quentin", { first: "Quentin", last: "Zabrowski", email: "q@example.org" });
    await person("tom", { first: "Tom", last: "Okafor", phone: "217-555-0199" });
    await person("tomas", { first: "Tomas", last: "Okafor", phone: "217-555-0199" });

    // History on the records that will be merged.
    await as(db, a.staff, async (tx) => {
      const batch = (await one<{ id: string }>(tx.execute(sql`insert into batches (org_id, batch_date) values (${a.id}, current_date) returning id`))).id;
      for (const [key, amount] of [["dana1", 100], ["dana2", 50], ["dana2", 25]] as const) {
        await tx.execute(sql`insert into gifts (org_id, constituent_id, batch_id, amount, gift_date, fund_id, payment_method) values (${a.id}, ${ids[key]}, ${batch}, ${amount}, current_date, ${fund}, 'cash')`);
      }
      await tx.execute(sql`insert into interactions (org_id, constituent_id, type, occurred_on, summary) values (${a.id}, ${ids.dana2}, 'call', current_date, 'Called about the gala')`);
      await tx.execute(sql`insert into relationships (org_id, from_constituent_id, to_constituent_id, type, reciprocal_type) values (${a.id}, ${ids.dana2}, ${ids.quentin}, 'friend', 'friend')`);
      const tag = (await one<{ id: string }>(tx.execute(sql`insert into tags (org_id, name) values (${a.id}, 'Volunteer') returning id`))).id;
      await tx.execute(sql`insert into constituent_tags (org_id, constituent_id, tag_id) values (${a.id}, ${ids.dana2}, ${tag})`);
    });
    // Post the batch so the merge has to move locked gifts too.
    await as(db, a.admin, (tx) => tx.execute(sql`select * from app.post_batch((select id from batches where org_id = ${a.id} limit 1))`));
  });

  afterAll(async () => cleanup(db, [a]));

  function pairKey(x: string, y: string) {
    return [x, y].sort().join("|");
  }

  it("the scan finds the expected pairs with reasons and nothing else", async () => {
    const n = await as(db, a.staff, async (tx) => (await one<{ n: number }>(tx.execute(sql`select app.scan_duplicates(${a.id}) as n`))).n);
    const rows = await as(db, a.staff, async (tx) => (await tx.execute(sql`select a_id, b_id, score, reasons from duplicate_candidates where org_id = ${a.id} and status = 'open'`)) as unknown as { a_id: string; b_id: string; score: number; reasons: string[] }[]);
    const byPair = new Map(rows.map((r) => [pairKey(r.a_id, r.b_id), r]));

    expect(byPair.get(pairKey(ids.dana1!, ids.dana2!))?.reasons).toEqual(expect.arrayContaining(["same email", "same last name and ZIP"]));
    expect(byPair.get(pairKey(ids.dana1!, ids.dana3!))?.reasons).toEqual(expect.arrayContaining(["same phone"]));
    expect(byPair.get(pairKey(ids.dana1!, ids.marco!))?.reasons).toEqual(["same last name and ZIP"]);
    expect(byPair.get(pairKey(ids.tom!, ids.tomas!))?.reasons).toEqual(expect.arrayContaining(["same phone", "similar name"]));
    expect(byPair.has(pairKey(ids.quentin!, ids.dana1!))).toBe(false);
    expect(byPair.has(pairKey(ids.quentin!, ids.tom!))).toBe(false);
    expect(n).toBe(rows.length);
    // Email plus last name and ZIP is a certain match; phone plus a near name also tops out.
    expect(byPair.get(pairKey(ids.dana1!, ids.dana2!))?.score).toBe(1);
    expect(byPair.get(pairKey(ids.dana1!, ids.marco!))?.score).toBeLessThan(0.5);
  });

  it("a new record with a matching email lands in the queue by trigger", async () => {
    await person("dana4", { first: "Danny", last: "Rivera", email: "dana.rivera@example.org" });
    const row = await as(db, a.staff, async (tx) => (await tx.execute(sql`select reasons from duplicate_candidates where org_id = ${a.id} and status = 'open' and (a_id = ${ids.dana4} or b_id = ${ids.dana4})`)) as unknown as { reasons: string[] }[]);
    expect(row.length).toBeGreaterThan(0);
    expect(row.every((r) => r.reasons.includes("same email"))).toBe(true);
    await as(db, a.admin, (tx) => tx.execute(sql`delete from constituents where id = ${ids.dana4}`));
  });

  it("staff can mark a pair as not a duplicate, and the scan leaves it alone", async () => {
    const n = await as(db, a.staff, async (tx) => (await tx.execute(sql`update duplicate_candidates set status = 'not_duplicate', resolved_at = now(), resolved_by = ${a.staff.id} where org_id = ${a.id} and a_id = ${[ids.dana1, ids.marco].sort()[0]} and b_id = ${[ids.dana1, ids.marco].sort()[1]}`)).count);
    expect(n).toBe(1);
    await as(db, a.staff, (tx) => tx.execute(sql`select app.scan_duplicates(${a.id})`));
    const status = await as(db, a.staff, async (tx) => (await one<{ status: string }>(tx.execute(sql`select status from duplicate_candidates where org_id = ${a.id} and a_id = ${[ids.dana1, ids.marco].sort()[0]} and b_id = ${[ids.dana1, ids.marco].sort()[1]}`))).status);
    expect(status).toBe("not_duplicate");
  });

  it("only an owner or admin with MFA can merge", async () => {
    expect(await errorCode(as(db, a.staff, (tx) => tx.execute(sql`select app.merge_constituents(${ids.dana1}, ${ids.dana2})`)))).toBe("42501");
    expect(await errorCode(as(db, a.admin, (tx) => tx.execute(sql`select app.merge_constituents(${ids.dana1}, ${ids.dana2})`), "aal1"))).toBe("42501");
  });

  it("a merge moves every gift, interaction, relationship and tag to the survivor", async () => {
    mergeId = await as(db, a.admin, async (tx) => (await one<{ id: string }>(tx.execute(sql`select app.merge_constituents(${ids.dana1}, ${ids.dana2}, '{"first_name":"b","notes":"a"}'::jsonb) as id`))).id);

    const survivor = await as(db, a.staff, (tx) => one<{ first_name: string; notes: string; display_name: string }>(tx.execute(sql`select first_name, notes, display_name from constituents where id = ${ids.dana1}`)));
    expect(survivor.first_name).toBe("Dana");
    expect(survivor.notes).toBe("Prefers mail.");
    expect(survivor.display_name).toBe("Dana Rivera");

    const gone = await as(db, a.staff, async (tx) => (await tx.execute(sql`select id from constituents where id = ${ids.dana2}`)).length);
    expect(gone).toBe(0);

    const counts = await as(db, a.staff, (tx) => one<{ gifts: number; total: string; interactions: number; relationships: number; tags: number; emails: number; addresses: number }>(tx.execute(sql`
      select (select count(*) from gifts where constituent_id = ${ids.dana1})::int as gifts,
             (select sum(amount) from gifts where constituent_id = ${ids.dana1})::text as total,
             (select count(*) from interactions where constituent_id = ${ids.dana1})::int as interactions,
             (select count(*) from relationships where from_constituent_id = ${ids.dana1} or to_constituent_id = ${ids.dana1})::int as relationships,
             (select count(*) from constituent_tags where constituent_id = ${ids.dana1})::int as tags,
             (select count(*) from constituent_emails where constituent_id = ${ids.dana1})::int as emails,
             (select count(*) from constituent_addresses where constituent_id = ${ids.dana1})::int as addresses`)));
    expect(counts).toEqual({ gifts: 3, total: "175.00", interactions: 1, relationships: 1, tags: 1, emails: 1, addresses: 2 });

    // Candidate rows about the merged record are gone with it; the merge row is the record.
    const stale = await as(db, a.staff, async (tx) => (await tx.execute(sql`select id from duplicate_candidates where a_id = ${ids.dana2} or b_id = ${ids.dana2}`)).length);
    expect(stale).toBe(0);
    const history = await as(db, a.staff, (tx) => one<{ merged_display_name: string; reversed_at: string | null }>(tx.execute(sql`select merged_display_name, reversed_at from merge_history where id = ${mergeId}`)));
    expect(history).toEqual({ merged_display_name: "Dana Rivera", reversed_at: null });

    const audit = await as(db, a.admin, async (tx) => (await tx.execute(sql`select action from audit_log where org_id = ${a.id} and table_name = 'constituents' and row_id = ${ids.dana1} and action = 'merge'`)).length);
    expect(audit).toBe(1);
  });

  it("undo restores both records, their fields, and moves everything back", async () => {
    expect(await errorCode(as(db, a.staff, (tx) => tx.execute(sql`select app.unmerge(${mergeId})`)))).toBe("42501");
    await as(db, a.admin, (tx) => tx.execute(sql`select app.unmerge(${mergeId})`));

    const d1 = await as(db, a.staff, (tx) => one<{ first_name: string; notes: string }>(tx.execute(sql`select first_name, notes from constituents where id = ${ids.dana1}`)));
    expect(d1).toEqual({ first_name: "Danielle", notes: "Prefers mail." });
    const d2 = await as(db, a.staff, (tx) => one<{ first_name: string; display_name: string }>(tx.execute(sql`select first_name, display_name from constituents where id = ${ids.dana2}`)));
    expect(d2).toEqual({ first_name: "Dana", display_name: "Dana Rivera" });

    const back = await as(db, a.staff, (tx) => one<{ gifts1: number; gifts2: number; total2: string; interactions2: number; rel2: number; tags2: number; emails1: number; emails2: number; addr1: number; addr2: number; primary2: number }>(tx.execute(sql`
      select (select count(*) from gifts where constituent_id = ${ids.dana1})::int as gifts1,
             (select count(*) from gifts where constituent_id = ${ids.dana2})::int as gifts2,
             (select sum(amount) from gifts where constituent_id = ${ids.dana2})::text as total2,
             (select count(*) from interactions where constituent_id = ${ids.dana2})::int as interactions2,
             (select count(*) from relationships where from_constituent_id = ${ids.dana2})::int as rel2,
             (select count(*) from constituent_tags where constituent_id = ${ids.dana2})::int as tags2,
             (select count(*) from constituent_emails where constituent_id = ${ids.dana1})::int as emails1,
             (select count(*) from constituent_emails where constituent_id = ${ids.dana2})::int as emails2,
             (select count(*) from constituent_addresses where constituent_id = ${ids.dana1})::int as addr1,
             (select count(*) from constituent_addresses where constituent_id = ${ids.dana2})::int as addr2,
             (select count(*) from constituent_emails where constituent_id = ${ids.dana2} and is_primary)::int as primary2`)));
    expect(back).toEqual({ gifts1: 1, gifts2: 2, total2: "75.00", interactions2: 1, rel2: 1, tags2: 1, emails1: 1, emails2: 1, addr1: 1, addr2: 1, primary2: 1 });

    const tags1 = await as(db, a.staff, async (tx) => (await tx.execute(sql`select tag_id from constituent_tags where constituent_id = ${ids.dana1}`)).length);
    expect(tags1).toBe(0);
    const reopened = await as(db, a.staff, (tx) => one<{ status: string }>(tx.execute(sql`select status from duplicate_candidates where org_id = ${a.id} and a_id = ${[ids.dana1, ids.dana2].sort()[0]} and b_id = ${[ids.dana1, ids.dana2].sort()[1]}`)));
    expect(reopened.status).toBe("open");
    expect(await errorCode(as(db, a.admin, (tx) => tx.execute(sql`select app.unmerge(${mergeId})`)))).toBe("22023");
  });

  it("data health counts what the brief lists", async () => {
    const h = await as(db, a.staff, async (tx) => (await one<{ h: Record<string, number> }>(tx.execute(sql`select app.data_health(${a.id}) as h`))).h);
    expect(h.openDuplicates).toBeGreaterThanOrEqual(3);
    expect(h.missingEmail).toBeGreaterThanOrEqual(3); // dana3, marco, tom, tomas
    expect(h.giftsMissingFund).toBe(0);
    expect(h.unacknowledged14d).toBe(0);
    expect(h.stale36m).toBeGreaterThanOrEqual(3); // people with no gifts or interactions
    expect(h.constituents).toBe(7);
  });
});
