import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, cleanup, createOrgWithTeam, errorCode, hasDb, makeDb, type TestOrg } from "./helpers";
import type { Db } from "../src";

type Row = Record<string, unknown>;
const one = async <T = Row>(p: Promise<Row[]>): Promise<T> => (await p)[0] as T;

describe.skipIf(!hasDb)("phase 1: constituents, batches, gifts", () => {
  let db: Db;
  let a: TestOrg;
  let b: TestOrg;
  let fund = "";
  let dana = "";
  let pantryCo = "";
  let batch = "";

  beforeAll(async () => {
    db = makeDb();
    a = await createOrgWithTeam(db, "Gift Org A");
    b = await createOrgWithTeam(db, "Gift Org B");

    await as(db, a.staff, async (tx) => {
      fund = (await one<{ id: string }>(tx.execute(sql`insert into funds (org_id, name, code) values (${a.id}, 'General', 'GEN') returning id`))).id;
      dana = (await one<{ id: string }>(tx.execute(sql`
        insert into constituents (org_id, type, first_name, last_name, preferred_name) values (${a.id}, 'person', 'Danielle', 'Rivera', 'Dana') returning id`))).id;
      await tx.execute(sql`insert into constituent_emails (org_id, constituent_id, email, is_primary) values (${a.id}, ${dana}, '  Dana.Rivera@Example.org ', true)`);
      await tx.execute(sql`insert into constituent_phones (org_id, constituent_id, phone, is_primary) values (${a.id}, ${dana}, '+1 (555) 010-2233', true)`);
      await tx.execute(sql`insert into constituent_addresses (org_id, constituent_id, line1, city, state, postal_code, is_primary) values (${a.id}, ${dana}, '12 Elm St', 'Springfield', 'IL', '62701-1234', true)`);
      pantryCo = (await one<{ id: string }>(tx.execute(sql`insert into constituents (org_id, type, org_name) values (${a.id}, 'organization', 'Pantry Partners LLC') returning id`))).id;
      await tx.execute(sql`insert into relationships (org_id, from_constituent_id, to_constituent_id, type, reciprocal_type) values (${a.id}, ${dana}, ${pantryCo}, 'employee', 'employer')`);
      await tx.execute(sql`insert into interactions (org_id, constituent_id, type, occurred_on, summary) values (${a.id}, ${dana}, 'call', current_date, 'Thanked her for the spring gift')`);
      const tag = (await one<{ id: string }>(tx.execute(sql`insert into tags (org_id, name) values (${a.id}, 'Board') returning id`))).id;
      await tx.execute(sql`insert into constituent_tags (org_id, constituent_id, tag_id) values (${a.id}, ${dana}, ${tag})`);
      batch = (await one<{ id: string }>(tx.execute(sql`insert into batches (org_id, batch_date, description, expected_total, expected_count) values (${a.id}, current_date, 'Monday deposit', 2100.00, 20) returning id`))).id;
      for (let i = 0; i < 20; i++) {
        await tx.execute(sql`
          insert into gifts (org_id, constituent_id, batch_id, amount, gift_date, fund_id, payment_method, check_number)
          values (${a.id}, ${i % 2 ? dana : pantryCo}, ${batch}, 105.00, current_date, ${fund}, 'check', ${`10${i}`})`);
      }
    });
  });

  afterAll(async () => cleanup(db, [a, b]));

  it("keeps names and normalized contact points by trigger", async () => {
    const c = await as(db, a.staff, (tx) => one<{ display_name: string; sort_name: string }>(tx.execute(sql`select display_name, sort_name from constituents where id = ${dana}`)));
    expect(c).toEqual({ display_name: "Dana Rivera", sort_name: "Rivera, Dana" });
    const org = await as(db, a.staff, (tx) => one<{ display_name: string; sort_name: string }>(tx.execute(sql`select display_name, sort_name from constituents where id = ${pantryCo}`)));
    expect(org.display_name).toBe("Pantry Partners LLC");
    const e = await as(db, a.staff, (tx) => one<{ email: string }>(tx.execute(sql`select email from constituent_emails where constituent_id = ${dana}`)));
    expect(e.email).toBe("dana.rivera@example.org");
    const p = await as(db, a.staff, (tx) => one<{ digits: string }>(tx.execute(sql`select digits from constituent_phones where constituent_id = ${dana}`)));
    expect(p.digits).toBe("5550102233");
    expect(await errorCode(as(db, a.staff, (tx) => tx.execute(sql`insert into constituents (org_id, type) values (${a.id}, 'person')`)))).toBe("23514");
  });

  it("board viewers see no donor data, and org B sees nothing of org A", async () => {
    for (const t of ["constituents", "gifts", "batches", "interactions", "funds"]) {
      const n = await as(db, a.boardViewer, async (tx) => (await tx.execute(sql`select count(*)::int as n from ${sql.identifier(t)}`))[0] as { n: number });
      expect(n.n, t).toBe(0);
      const nb = await as(db, b.owner, async (tx) => (await tx.execute(sql`select count(*)::int as n from ${sql.identifier(t)}`))[0] as { n: number });
      expect(nb.n, t).toBe(0);
    }
  });

  it("refuses a child row whose parent belongs to another org", async () => {
    const code = await errorCode(as(db, b.owner, (tx) => tx.execute(sql`insert into constituent_emails (org_id, constituent_id, email) values (${b.id}, ${dana}, 'x@test.invalid')`)));
    expect(code).toBe("23503");
  });

  it("staff cannot post, admins need MFA, and totals must match", async () => {
    expect(await errorCode(as(db, a.staff, (tx) => tx.execute(sql`select * from app.post_batch(${batch})`)))).toBe("42501");
    expect(await errorCode(as(db, a.admin, (tx) => tx.execute(sql`select * from app.post_batch(${batch})`), "aal1"))).toBe("42501");
    expect(await errorCode(as(db, a.staff, (tx) => tx.execute(sql`update batches set status = 'posted' where id = ${batch}`)))).toBe("42501");
    await as(db, a.staff, (tx) => tx.execute(sql`update batches set expected_total = 2000 where id = ${batch}`));
    expect(await errorCode(as(db, a.admin, (tx) => tx.execute(sql`select * from app.post_batch(${batch})`)))).toBe("23514");
    await as(db, a.staff, (tx) => tx.execute(sql`update batches set expected_total = 2100 where id = ${batch}`));
  });

  it("an admin posts 20 gifts, which then lock, and the audit log shows every change", async () => {
    const r = await as(db, a.admin, (tx) => one<{ posted_count: number; posted_total: string }>(tx.execute(sql`select * from app.post_batch(${batch})`)));
    expect(r.posted_count).toBe(20);
    expect(Number(r.posted_total)).toBe(2100);

    const posted = await as(db, a.staff, (tx) => one<{ n: number }>(tx.execute(sql`select count(*)::int as n from gifts where batch_id = ${batch} and posted_at is not null and posted_by = ${a.admin.id}`)));
    expect(posted.n).toBe(20);
    const status = await as(db, a.staff, (tx) => one<{ status: string }>(tx.execute(sql`select status from batches where id = ${batch}`)));
    expect(status.status).toBe("posted");

    const giftId = (await as(db, a.staff, (tx) => one<{ id: string }>(tx.execute(sql`select id from gifts where batch_id = ${batch} limit 1`)))).id;
    expect(await errorCode(as(db, a.staff, (tx) => tx.execute(sql`update gifts set amount = 1 where id = ${giftId}`)))).toBe("42501");
    expect(await errorCode(as(db, a.admin, (tx) => tx.execute(sql`delete from gifts where id = ${giftId}`)))).toBe("42501");
    expect(await errorCode(as(db, a.admin, (tx) => tx.execute(sql`select * from app.post_batch(${batch})`)))).toBe("42501");
    expect(await errorCode(as(db, a.staff, (tx) => tx.execute(sql`insert into gifts (org_id, constituent_id, batch_id, amount, gift_date, fund_id) values (${a.id}, ${dana}, ${batch}, 5, current_date, ${fund})`)))).toBe("42501");
    // Acknowledging a posted gift is still allowed.
    const ack = await as(db, a.staff, async (tx) => (await tx.execute(sql`update gifts set acknowledged_at = now(), acknowledgment_method = 'letter' where id = ${giftId}`)).count);
    expect(ack).toBe(1);

    const audit = await as(db, a.admin, async (tx) => (await tx.execute(sql`
      select action, count(*)::int as n from audit_log where org_id = ${a.id} and table_name = 'gifts' group by action order by action`)) as unknown as { action: string; n: number }[]);
    expect(audit).toEqual([
      { action: "insert", n: 20 },
      { action: "update", n: 21 },
    ]);
    const poster = await as(db, a.admin, (tx) => one<{ actor_id: string }>(tx.execute(sql`select actor_id from audit_log where table_name = 'batches' and action = 'update' and (after->>'status') = 'posted' and row_id = ${batch}`)));
    expect(poster.actor_id).toBe(a.admin.id);
  });

  it("a constituent with gifts cannot be deleted", async () => {
    expect(await errorCode(as(db, a.admin, (tx) => tx.execute(sql`delete from constituents where id = ${dana}`)))).toBe("23503");
  });

  it("search finds people by name, email and phone", async () => {
    const byName = await as(db, a.staff, async (tx) => (await tx.execute(sql`select display_name from app.search_constituents(${a.id}, 'dana riv')`)) as unknown as { display_name: string }[]);
    expect(byName[0]?.display_name).toBe("Dana Rivera");
    const byEmail = await as(db, a.staff, async (tx) => (await tx.execute(sql`select display_name from app.search_constituents(${a.id}, 'dana.rivera@')`)) as unknown as { display_name: string }[]);
    expect(byEmail[0]?.display_name).toBe("Dana Rivera");
    const byPhone = await as(db, a.staff, async (tx) => (await tx.execute(sql`select display_name from app.search_constituents(${a.id}, '010-2233')`)) as unknown as { display_name: string }[]);
    expect(byPhone[0]?.display_name).toBe("Dana Rivera");
    const partner = await as(db, a.staff, async (tx) => (await tx.execute(sql`select display_name from app.search_constituents(${a.id}, 'partners')`)) as unknown as { display_name: string }[]);
    expect(partner[0]?.display_name).toBe("Pantry Partners LLC");
    const none = await as(db, b.staff, async (tx) => (await tx.execute(sql`select * from app.search_constituents(${a.id}, 'dana')`)).length);
    expect(none).toBe(0);
  });

  it("scores likely duplicates with reasons", async () => {
    const byEmail = await as(db, a.staff, async (tx) => (await tx.execute(sql`select * from app.find_duplicates(${a.id}, 'D', 'Rivera', 'DANA.RIVERA@example.org')`)) as unknown as { display_name: string; score: number; reasons: string[] }[]);
    expect(byEmail[0]?.display_name).toBe("Dana Rivera");
    expect(byEmail[0]?.score).toBeGreaterThanOrEqual(0.9);
    expect(byEmail[0]?.reasons).toContain("same email");

    const byPhone = await as(db, a.staff, async (tx) => (await tx.execute(sql`select * from app.find_duplicates(${a.id}, 'Someone', 'Else', null, '555-010-2233')`)) as unknown as { reasons: string[] }[]);
    expect(byPhone[0]?.reasons).toEqual(["same phone"]);

    const byName = await as(db, a.staff, async (tx) => (await tx.execute(sql`select * from app.find_duplicates(${a.id}, 'Dana', 'Rivera')`)) as unknown as { reasons: string[]; score: number }[]);
    expect(byName[0]?.reasons).toContain("similar name");

    const byPostal = await as(db, a.staff, async (tx) => (await tx.execute(sql`select * from app.find_duplicates(${a.id}, 'Marco', 'Rivera', null, null, '62701')`)) as unknown as { reasons: string[] }[]);
    expect(byPostal[0]?.reasons).toContain("same last name and ZIP");

    const nothing = await as(db, a.staff, async (tx) => (await tx.execute(sql`select * from app.find_duplicates(${a.id}, 'Quentin', 'Zabrowski')`)).length);
    expect(nothing).toBe(0);
  });
});
