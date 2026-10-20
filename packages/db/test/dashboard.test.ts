import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, cleanup, createOrgWithTeam, hasDb, makeDb, type TestOrg } from "./helpers";
import type { Db } from "../src";

/**
 * Acceptance: dashboard numbers match a hand calculation. The fixture is a small org
 * with a July fiscal year. The expected values are computed below in plain TypeScript
 * from the same gift list, following docs/phase-4.md, the way a person would in a
 * spreadsheet, and compared with app.compute_dashboard().
 */
type G = { who: string; amount: number; date: string; fund: "General" | "Food"; posted?: boolean; type?: string };

const AS_OF = "2026-10-20"; // fiscal year started 2026-07-01
const GIFTS: G[] = [
  // FY2024 (2024-07-01 to 2025-06-30): the earlier retention year
  { who: "ana", amount: 100, date: "2023-11-01", fund: "General" }, // ana first gave before FY2024
  { who: "ana", amount: 100, date: "2024-12-01", fund: "General" },
  { who: "ben", amount: 50, date: "2024-09-15", fund: "General" }, // ben: first-time in FY2024
  { who: "cal", amount: 75, date: "2025-03-03", fund: "Food" }, // cal: first-time in FY2024
  { who: "dee", amount: 20, date: "2022-01-01", fund: "General" },
  { who: "dee", amount: 40, date: "2025-01-10", fund: "General" }, // dee: repeat in FY2024
  // FY2025 (2025-07-01 to 2026-06-30): the later retention year
  { who: "ana", amount: 200, date: "2025-08-01", fund: "General" }, // retained, repeat
  { who: "ben", amount: 60, date: "2026-02-14", fund: "Food" }, // retained, first-time
  { who: "eve", amount: 500, date: "2025-07-20", fund: "General" }, // new in FY2025, last gift 15 months before as-of
  // Prior year to date: 2025-07-01 .. 2025-10-20
  { who: "fay", amount: 30, date: "2025-09-30", fund: "Food" },
  // FY2026 year to date: 2026-07-01 .. 2026-10-20
  { who: "ana", amount: 150, date: "2026-07-05", fund: "General" },
  { who: "ben", amount: 25, date: "2026-08-01", fund: "Food" },
  { who: "gus", amount: 1000, date: "2026-09-09", fund: "General" }, // new this year
  { who: "gus", amount: 10, date: "2026-10-01", fund: "General" },
  { who: "hal", amount: 35, date: "2026-10-19", fund: "Food" }, // new this year
  // Not counted: soft credit, pledge, unposted, after as-of
  { who: "ana", amount: 999, date: "2026-07-10", fund: "General", type: "soft_credit" },
  { who: "ben", amount: 888, date: "2026-07-10", fund: "General", type: "pledge" },
  { who: "cal", amount: 777, date: "2026-07-10", fund: "General", posted: false },
  { who: "hal", amount: 666, date: "2026-10-25", fund: "General" },
];

function handCalculate() {
  const counted = GIFTS.filter((g) => g.posted !== false && !["soft_credit", "pledge"].includes(g.type ?? "") && g.date <= AS_OF);
  const between = (a: string, b: string) => counted.filter((g) => g.date >= a && g.date <= b);
  const ytd = between("2026-07-01", AS_OF);
  const pytd = between("2025-07-01", "2025-10-20");
  const donors = (gs: G[]) => new Set(gs.map((g) => g.who));
  const sum = (gs: G[]) => gs.reduce((s, g) => s + g.amount, 0);
  const first = new Map<string, string>();
  const last = new Map<string, string>();
  for (const g of counted) {
    if (!first.has(g.who) || g.date < first.get(g.who)!) first.set(g.who, g.date);
    if (!last.has(g.who) || g.date > last.get(g.who)!) last.set(g.who, g.date);
  }
  const y1 = donors(counted.filter((g) => g.date >= "2024-07-01" && g.date < "2025-07-01"));
  const y2 = donors(counted.filter((g) => g.date >= "2025-07-01" && g.date < "2026-07-01"));
  const y1New = [...y1].filter((w) => first.get(w)! >= "2024-07-01");
  const y1Rep = [...y1].filter((w) => first.get(w)! < "2024-07-01");
  const amounts = ytd.map((g) => g.amount).sort((a, b) => a - b);
  const mid = amounts.length / 2;
  const median = amounts.length % 2 ? amounts[Math.floor(mid)]! : (amounts[mid - 1]! + amounts[mid]!) / 2;
  const byFund = (f: string) => sum(ytd.filter((g) => g.fund === f));
  const lapsed = [...last.values()].filter((d) => d <= "2025-09-20" && d > "2025-07-20").length;
  return {
    donorsYtd: donors(ytd).size,
    donorsPriorYtd: donors(pytd).size,
    dollarsYtd: sum(ytd),
    dollarsPriorYtd: sum(pytd),
    giftsYtd: ytd.length,
    averageGiftYtd: Math.round((sum(ytd) / ytd.length) * 100) / 100,
    medianGiftYtd: median,
    newDonorsYtd: [...donors(ytd)].filter((w) => first.get(w)! >= "2026-07-01").length,
    repeatDonorsYtd: [...donors(ytd)].filter((w) => first.get(w)! < "2026-07-01").length,
    retention: {
      overall: { base: y1.size, retained: [...y1].filter((w) => y2.has(w)).length },
      firstTime: { base: y1New.length, retained: y1New.filter((w) => y2.has(w)).length },
      repeat: { base: y1Rep.length, retained: y1Rep.filter((w) => y2.has(w)).length },
    },
    fundGeneral: byFund("General"),
    fundFood: byFund("Food"),
    top: [...ytd].sort((a, b) => b.amount - a.amount)[0]!.amount,
    lapsed,
  };
}

describe.skipIf(!hasDb)("phase 4: dashboard matches a hand calculation", () => {
  let db: Db;
  let a: TestOrg;

  beforeAll(async () => {
    db = makeDb();
    a = await createOrgWithTeam(db, "Dashboard Org");
    await db.execute(sql`update organizations set fiscal_year_start_month = 7 where id = ${a.id}`);
    await as(db, a.admin, async (tx) => {
      const funds: Record<string, string> = {};
      for (const f of ["General", "Food"]) funds[f] = ((await tx.execute(sql`insert into funds (org_id, name) values (${a.id}, ${f}) returning id`))[0] as { id: string }).id;
      const people: Record<string, string> = {};
      for (const w of new Set(GIFTS.map((g) => g.who))) people[w] = ((await tx.execute(sql`insert into constituents (org_id, first_name, last_name) values (${a.id}, ${w}, 'Fixture') returning id`))[0] as { id: string }).id;
      // Insert as the system actor so posted gifts can be written directly.
      await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ actor: "system", role: "authenticated", org_id: a.id })}, true)`);
      for (const g of GIFTS) {
        await tx.execute(sql`
          insert into gifts (org_id, constituent_id, amount, gift_date, fund_id, gift_type, posted_at)
          values (${a.id}, ${people[g.who]}, ${g.amount}, ${g.date}, ${funds[g.fund]}, ${g.type ?? "one_time"}::gift_type, ${g.posted === false ? null : "2026-10-20T00:00:00Z"})`);
      }
    });
  });
  afterAll(async () => cleanup(db, [a]));

  it("every number on the dashboard equals the hand calculation", async () => {
    // compute_dashboard is not callable by app users (they go through refresh_dashboard, which
    // checks membership); the test calls it directly to pin the date.
    const d = ((await db.execute(sql`select app.compute_dashboard(${a.id}, ${AS_OF}::date) as d`))[0] as { d: Record<string, any> }).d;
    const e = handCalculate();
    expect(Number(d.donorsYtd)).toBe(e.donorsYtd);
    expect(Number(d.donorsPriorYtd)).toBe(e.donorsPriorYtd);
    expect(Number(d.dollarsYtd)).toBe(e.dollarsYtd);
    expect(Number(d.dollarsPriorYtd)).toBe(e.dollarsPriorYtd);
    expect(Number(d.giftsYtd)).toBe(e.giftsYtd);
    expect(Number(d.averageGiftYtd)).toBe(e.averageGiftYtd);
    expect(Number(d.medianGiftYtd)).toBe(e.medianGiftYtd);
    expect(Number(d.newDonorsYtd)).toBe(e.newDonorsYtd);
    expect(Number(d.repeatDonorsYtd)).toBe(e.repeatDonorsYtd);
    expect(d.retention).toEqual(e.retention);
    expect(Number(d.byFund.find((f: { name: string }) => f.name === "General").total)).toBe(e.fundGeneral);
    expect(Number(d.byFund.find((f: { name: string }) => f.name === "Food").total)).toBe(e.fundFood);
    expect(Number(d.topGifts[0].amount)).toBe(e.top);
    expect(Number(d.lapsed.count)).toBe(e.lapsed);

    // Spot-check the hand calculation itself against numbers a person would write down.
    expect(e).toMatchObject({
      donorsYtd: 4, dollarsYtd: 1220, giftsYtd: 5, medianGiftYtd: 35, newDonorsYtd: 2,
      retention: { overall: { base: 4, retained: 2 }, firstTime: { base: 2, retained: 1 }, repeat: { base: 2, retained: 1 } },
    });
  });

  it("app users cannot call the raw computation for another org", async () => {
    const code = await as(db, a.staff, (tx) => tx.execute(sql`select app.compute_dashboard(${a.id})`)).then(() => null, (e) => e.cause?.code ?? e.code);
    expect(code).toBe("42501");
  });

  it("board viewers can refresh and read the snapshot but not the gifts", async () => {
    await as(db, a.boardViewer, (tx) => tx.execute(sql`select app.refresh_dashboard(${a.id})`));
    const snap = await as(db, a.boardViewer, async (tx) => (await tx.execute(sql`select count(*)::int as n from dashboard_snapshots where org_id = ${a.id}`))[0] as { n: number });
    expect(snap.n).toBe(1);
    const gifts = await as(db, a.boardViewer, async (tx) => (await tx.execute(sql`select count(*)::int as n from gifts`))[0] as { n: number });
    expect(gifts.n).toBe(0);
  });

  it("a board link hides names when the org says so, and stops working when revoked", async () => {
    await as(db, a.owner, (tx) => tx.execute(sql`insert into board_share_links (org_id, token_hash, label) values (${a.id}, 'hash-1', 'Board')`));
    const named = await db.execute(sql`select app.board_view('hash-1') as v`);
    const v1 = (named[0] as { v: { hideNames: boolean; data: { topGifts: { name: string; giftId?: string }[] } } }).v;
    expect(v1.hideNames).toBe(true); // the default
    expect(v1.data.topGifts.every((g) => g.name === "A donor" && g.giftId === undefined)).toBe(true);
    await as(db, a.owner, (tx) => tx.execute(sql`update organizations set hide_board_names = false where id = ${a.id}`));
    const shown = (await db.execute(sql`select app.board_view('hash-1') as v`))[0] as { v: { data: { topGifts: { name: string }[] } } };
    expect(shown.v.data.topGifts[0]!.name).toBe("gus Fixture");
    await as(db, a.owner, (tx) => tx.execute(sql`update board_share_links set revoked_at = now() where org_id = ${a.id}`));
    const gone = (await db.execute(sql`select app.board_view('hash-1') as v`))[0] as { v: unknown };
    expect(gone.v).toBeNull();
  });
});
