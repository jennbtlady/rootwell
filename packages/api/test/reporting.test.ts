import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withPublic, type Db } from "@maple/db";
import { boardView } from "@maple/core/services";
import { app, setDb, setMailer, setVerifier, type Mail } from "../src";
import { pdfPages } from "./pdf-text";

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

/**
 * Acceptance: a bulk acknowledgment run produces correct PDFs and emails. Three donors:
 * a plain cash gift, a gala ticket with goods received, and a donor who asked not to be
 * emailed. The emails and every PDF page are read back and checked word for word.
 */
describe.skipIf(!DATABASE_URL)("acknowledgments, statements, reports", () => {
  let db: Db;
  let owner: U;
  let board: U;
  let orgId = "";
  const sent: Mail[] = [];
  const giftIds: Record<string, string> = {};
  const h = (u: U) => ({ authorization: `Bearer token:${u.id}:aal2`, ...json });
  const call = (u: U, method: string, path: string, body?: unknown) => app.request(`/api/v1/orgs/${orgId}${path}`, { method, headers: h(u), body: body ? JSON.stringify(body) : undefined });
  const lastYear = new Date().getUTCFullYear() - 1;

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    setDb(db);
    setVerifier(async (token) => {
      const [, sub, aal] = token.split(":");
      return { sub, aal };
    });
    setMailer({ from: "test", send: async (m) => void sent.push(m) });
    owner = await createUser(db, "rep-owner");
    board = await createUser(db, "rep-board");
    orgId = ((await (await app.request("/api/v1/orgs", { method: "POST", headers: h(owner), body: JSON.stringify({ name: "Riverside Food Pantry" }) })).json()) as { id: string }).id;
    await db.execute(sql`update organizations set ein = '12-3456789', address = '{"line1":"100 Main St","city":"Springfield","state":"IL","postalCode":"62701"}' where id = ${orgId}`);
    await db.execute(sql`insert into org_memberships (org_id, user_id, role, status, accepted_at) values (${orgId}, ${board.id}, 'board_viewer', 'active', now())`);

    const fund = ((await (await call(owner, "POST", "/coding/funds", { name: "General operating" })).json()) as { id: string }).id;
    const person = async (body: unknown) => ((await (await call(owner, "POST", "/constituents", body)).json()) as { id: string }).id;
    const dana = await person({ firstName: "Danielle", preferredName: "Dana", lastName: "Rivera", emails: [{ email: "dana@example.org" }], addresses: [{ line1: "12 Elm St", city: "Springfield", state: "IL", postalCode: "62701" }] });
    const tom = await person({ firstName: "Tom", lastName: "Okafor", emails: [{ email: "tom@example.org" }], addresses: [{ line1: "9 Oak Ave", city: "Chatham", state: "IL", postalCode: "62629" }] });
    const ruth = await person({ firstName: "Ruth", lastName: "Goldberg", doNotEmail: true, emails: [{ email: "ruth@example.org" }], addresses: [{ line1: "3 Pine Rd", city: "Sherman", state: "IL", postalCode: "62684" }] });

    const today = new Date().toISOString().slice(0, 10);
    const batch = ((await (await call(owner, "POST", "/batches", { batchDate: today })).json()) as { id: string }).id;
    const gift = async (key: string, body: Record<string, unknown>) => {
      const r = await call(owner, "POST", "/gifts", { batchId: batch, giftDate: today, fundId: fund, paymentMethod: "cash", ...body });
      expect(r.status).toBe(201);
      giftIds[key] = ((await r.json()) as { id: string }).id;
    };
    await gift("dana", { constituentId: dana, amount: "300" });
    await gift("tom", { constituentId: tom, amount: "150", deductibleAmount: "90" });
    await gift("ruth", { constituentId: ruth, amount: "50" });
    expect((await call(owner, "POST", `/batches/${batch}/post`)).status).toBe(200);

    // Last year's gifts for the statement and LYBUNT.
    await db.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ actor: "system", role: "authenticated", org_id: orgId })}, false)`);
    for (const [who, amt, date, ded] of [[dana, 100, `${lastYear}-03-14`, 100], [dana, 250, `${lastYear}-11-02`, 200], [tom, 40, `${lastYear}-05-05`, 40]] as const) {
      await db.execute(sql`insert into gifts (org_id, constituent_id, amount, gift_date, fund_id, deductible_amount, posted_at) values (${orgId}, ${who}, ${amt}, ${date}, ${fund}, ${ded}, now())`);
    }
    await db.execute(sql`select set_config('request.jwt.claims', '', false)`);
  });

  afterAll(async () => {
    await db.execute(sql`delete from organizations where id = ${orgId}`);
    for (const u of [owner, board]) await db.execute(sql`delete from auth.users where id = ${u.id}`);
    setVerifier(undefined);
    setMailer(undefined);
    setDb(undefined);
  });

  it("bulk email: right people, right words, do-not-email respected, gifts marked thanked", async () => {
    const templates = ((await (await call(owner, "GET", "/ack-templates")).json()) as { items: { id: string; channel: string }[] }).items;
    const email = templates.find((t) => t.channel === "email")!;
    const res = await call(owner, "POST", "/acks/email", { giftIds: Object.values(giftIds), templateId: email.id });
    expect(await res.json()).toEqual({ sent: 2, failed: 0, skipped: 1, firstError: null });
    expect(sent.map((m) => m.to).sort()).toEqual(["dana@example.org", "tom@example.org"]);

    const danaMail = sent.find((m) => m.to === "dana@example.org")!;
    expect(danaMail.subject).toBe("Thank you for your gift to Riverside Food Pantry");
    expect(danaMail.text).toContain("Dear Dana,");
    expect(danaMail.text).toContain("Thank you for your gift of $300.00");
    expect(danaMail.text).toContain("No goods or services were provided in exchange for this contribution.");
    expect(danaMail.text).toContain("EIN 12-3456789");
    expect(danaMail.html).toContain("<p");

    const tomMail = sent.find((m) => m.to === "tom@example.org")!;
    expect(tomMail.text).toContain("estimated fair market value of $60.00");
    expect(tomMail.text).toContain("may be tax deductible is $90.00");

    const queue = (await (await call(owner, "GET", "/ack-queue")).json()) as { items: { giftId: string }[] };
    expect(queue.items.map((q) => q.giftId)).toContain(giftIds.ruth);
    expect(queue.items.map((q) => q.giftId)).not.toContain(giftIds.dana);
  });

  it("bulk letters: one PDF page per gift with the address block and IRS language", async () => {
    const templates = ((await (await call(owner, "GET", "/ack-templates")).json()) as { items: { id: string; channel: string }[] }).items;
    const letter = templates.find((t) => t.channel === "letter")!;
    const res = await call(owner, "POST", "/acks/letters", { giftIds: [giftIds.ruth], templateId: letter.id, markSent: true });
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const pages = await pdfPages(await res.arrayBuffer());
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("Riverside Food Pantry");
    expect(pages[0]).toContain("Ruth Goldberg");
    expect(pages[0]).toContain("3 Pine Rd");
    expect(pages[0]).toContain("Sherman, IL 62684");
    expect(pages[0]).toContain("Dear Ruth,");
    expect(pages[0]).toContain("$50.00");
    expect(pages[0]).toContain("No goods or services were provided");
    // This year's three gifts are all thanked now; only last year's history remains.
    const queue = (await (await call(owner, "GET", "/ack-queue")).json()) as { items: { giftId: string }[] };
    expect(queue.items.map((q) => q.giftId).filter((id) => Object.values(giftIds).includes(id))).toEqual([]);
  });

  it("annual statements: one page per donor, deductible amounts, totals", async () => {
    const list = (await (await call(owner, "GET", `/statements/${lastYear}`)).json()) as { donors: { name: string; total: string; deductibleTotal: string; gifts: number }[] };
    const byName = Object.fromEntries(list.donors.map((d) => [d.name, [d.gifts, d.total, d.deductibleTotal]]));
    expect(byName).toEqual({ "Dana Rivera": [2, "350.00", "300.00"], "Tom Okafor": [1, "40.00", "40.00"] });
    const pdf = await call(owner, "POST", `/statements/${lastYear}/pdf`, {});
    const pages = await pdfPages(await pdf.arrayBuffer());
    expect(pages).toHaveLength(2);
    const danaPage = pages.find((p) => p.includes("Dana Rivera"))!;
    expect(danaPage).toContain(`${lastYear} giving statement for Dana Rivera`);
    expect(danaPage).toContain("goods or services received: $50.00");
    expect(danaPage).toContain("$350.00");
    expect(danaPage).toContain("$300.00");

    sent.length = 0;
    const emailed = await call(owner, "POST", `/statements/${lastYear}/email`, {});
    expect(await emailed.json()).toMatchObject({ sent: 2, skipped: 0, failed: 0 });
    expect(sent[0]!.attachments?.[0]?.contentType).toBe("application/pdf");
    expect((await pdfPages(sent[0]!.attachments![0]!.content)).length).toBe(1);

    // A second click sends nothing: both donors already have this year's statement.
    sent.length = 0;
    const again = await call(owner, "POST", `/statements/${lastYear}/email`, {});
    expect(await again.json()).toMatchObject({ sent: 0, alreadySent: 2 });
    expect(sent).toHaveLength(0);
    const after = (await (await call(owner, "GET", `/statements/${lastYear}`)).json()) as { donors: { emailedAt: string | null; printedAt: string | null }[] };
    expect(after.donors.every((d) => d.emailedAt && !d.printedAt)).toBe(true);
    // Everyone was emailed, so there is nothing to print.
    expect((await call(owner, "POST", `/statements/${lastYear}/pdf`, { only: "to_print" })).status).toBe(409);
    // Sending again on purpose still works.
    const resent = await call(owner, "POST", `/statements/${lastYear}/email`, { resend: true });
    expect(await resent.json()).toMatchObject({ sent: 2, alreadySent: 0 });

    const boardTry = await call(board, "GET", `/statements/${lastYear}`);
    expect(boardTry.status).toBe(403);
  });

  it("reports: LYBUNT, CSV safety, and board viewers kept out", async () => {
    const lybunt = (await (await call(owner, "GET", "/reports/lybunt")).json()) as { rows: { name: string }[] };
    expect(lybunt.rows).toEqual([]); // both gave last year and again this year
    // The download is ready for a mail merge: name parts, address, and do-not-mail.
    const lyCsv = (await (await call(owner, "GET", "/reports/lybunt?format=csv")).text()).replace(/^\uFEFF/, "");
    expect(lyCsv.split("\r\n")[0]).toBe("Name,Email,Phone,Last fiscal year,Last gift,Lifetime,First name,Last name,Organization,Address line 1,Address line 2,City,State,ZIP code,Do not mail");
    const byFund = await call(owner, "GET", `/reports/gifts_by_fund?from=${lastYear}-01-01&format=csv`);
    expect(byFund.headers.get("content-type")).toContain("text/csv");
    const bytes = new Uint8Array(await byFund.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // byte order mark so Excel reads UTF-8
    const csv = new TextDecoder().decode(bytes.slice(3));
    expect(csv.split("\r\n")[0]).toBe("Fund,Code,Gifts,Donors,Total");
    expect(csv).toContain("General operating");
    // The file name says which dates it covers.
    expect(byFund.headers.get("content-disposition")).toMatch(new RegExp(`filename=".*-${lastYear}-01-01-to-\\d{4}-\\d{2}-\\d{2}\\.csv"`));
    // With no dates chosen, the report starts at the fiscal year start, like the dashboard.
    const fund = (await (await call(owner, "GET", "/reports/gifts_by_fund")).json()) as { range: { from: string }; totals: { gifts: number; donors: number }; rows: { gifts: number }[] };
    const home = (await (await call(owner, "GET", "/dashboard")).json()) as { data: { fiscalYearStart: string } };
    expect(fund.range.from).toBe(home.data.fiscalYearStart);
    // The total row is filled in, and a donor who gave to two funds counts once.
    expect(fund.totals.gifts).toBe(fund.rows.reduce((n, r) => n + Number(r.gifts), 0));
    expect(fund.totals.donors).toBeGreaterThan(0);
    expect((await call(board, "GET", "/reports/lybunt")).status).toBe(403);
    const dash = (await (await call(board, "GET", "/dashboard")).json()) as { data: { topGifts: { name: string }[] } };
    expect(dash.data.topGifts.every((g) => g.name === "A donor")).toBe(true);
    // Figures for the charts: gifts by size add up to the year's total, and each month has donor counts.
    const full = (await (await call(owner, "POST", "/dashboard/refresh")).json()) as { data: { dollarsYtd: string; giftsYtd: number; giftBands: { label: string; gifts: number; total: string }[]; byMonth: { donors: number; new_donors: number; gifts: number }[] } };
    expect(full.data.giftBands.map((b) => b.label)).toEqual(["$1,000 or more", "$250 to $999", "$100 to $249", "Under $100"]);
    expect(full.data.giftBands.reduce((n, b) => n + Number(b.total), 0)).toBeCloseTo(Number(full.data.dollarsYtd), 2);
    expect(full.data.giftBands.reduce((n, b) => n + b.gifts, 0)).toBe(full.data.giftsYtd);
    expect(full.data.byMonth.reduce((n, m) => n + m.gifts, 0)).toBe(full.data.giftsYtd);
    expect(full.data.byMonth.every((m) => typeof m.donors === "number" && typeof m.new_donors === "number")).toBe(true);
  });

  it("dashboard layouts: owners choose the cards, board links follow, staff and board viewers cannot change them", async () => {
    const board_ = ["headline", "pacing", "key_numbers", "campaign_goals", "by_fund", "gift_bands", "top_gifts", "by_month"];
    // Largest gifts first, monthly chart hidden.
    const cards = [...board_].reverse().map((id) => ({ id, shown: id !== "by_month" }));
    expect((await call(owner, "PUT", "/dashboard-layout", { view: "board", cards })).status).toBe(200);
    const org = (await (await call(owner, "GET", "")).json()) as { dashboardLayouts: { board: { id: string; shown: boolean }[]; staff: { id: string }[] } };
    expect(org.dashboardLayouts.board).toEqual(cards);
    expect(org.dashboardLayouts.staff.map((c) => c.id)).toEqual(["todo", "this_year", "pacing", "reach_out", "campaign_goals", "recent_gifts"]);

    // A board link carries the same layout, without signing in.
    const { token } = (await (await call(owner, "POST", "/board-links", { label: "Layout check" })).json()) as { token: string };
    const view = await withPublic(db, (tx) => boardView(tx, token));
    expect(view?.layout).toEqual(cards);

    // Every card once, at least one shown.
    expect((await call(owner, "PUT", "/dashboard-layout", { view: "board", cards: cards.slice(1) })).status).toBe(400);
    expect((await call(owner, "PUT", "/dashboard-layout", { view: "board", cards: cards.map((c) => ({ ...c, shown: false })) })).status).toBe(400);
    expect((await call(owner, "PUT", "/dashboard-layout", { view: "board", cards: [...cards.slice(1), { id: "made_up", shown: true }] })).status).toBe(400);
    expect((await call(board, "PUT", "/dashboard-layout", { view: "board", cards })).status).toBe(403);
    expect((await call(board, "DELETE", "/dashboard-layout/board")).status).toBe(403);

    // Reset goes back to the default order.
    expect((await call(owner, "DELETE", "/dashboard-layout/board")).status).toBe(200);
    const after = (await (await call(owner, "GET", "")).json()) as { dashboardLayouts: { board: { id: string; shown: boolean }[] } };
    expect(after.dashboardLayouts.board).toEqual(board_.map((id) => ({ id, shown: true })));
  });
});
