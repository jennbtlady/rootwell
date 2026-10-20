import { expect, test } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFile } from "node:fs/promises";
import { expectAccessible, signIn, state } from "./helpers";

const MAILPIT = "http://127.0.0.1:54324/api/v1";

async function pdfText(path: string): Promise<string[]> {
  const doc = await getDocument({ data: new Uint8Array(await readFile(path)) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push(c.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " "));
  }
  return pages;
}

/**
 * Phase 4 in the browser: dashboard and its accessibility, a board link that works
 * signed out and stops when turned off, a report download, and thank-you emails and
 * letters that really arrive and say the right thing.
 */
test.describe.serial("phase 4 dashboard, reports, thank-yous", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;

  test("the dashboard shows this year's numbers and passes an accessibility scan", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/dashboard`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Dollars this year")).toBeVisible();
    await page.getByRole("button", { name: "Refresh now" }).click();
    await page.getByRole("button", { name: "How first-time donor retention is counted" }).click();
    await expect(page.getByText(/Fundraising Effectiveness Project definition: of donors whose first gift/)).toBeVisible();
    await expectAccessible(page, "dashboard");
  });

  test("a board link works without signing in, hides names, and stops when turned off", async ({ page, browser }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/settings/board`);
    await expectAccessible(page, "board sharing");
    await page.getByRole("button", { name: "Make link" }).click();
    const link = (await page.locator("p.font-mono").innerText()).trim();
    expect(link).toMatch(/\/board\/[A-Za-z0-9_-]+$/);

    const anon = await browser.newContext();
    const board = await anon.newPage();
    await board.goto(link);
    await expect(board.getByRole("heading", { name: "Board dashboard" })).toBeVisible();
    await expect(board.getByText("Sign out")).toHaveCount(0);
    await expectAccessible(board, "board link");
    const top = board.locator("ol li");
    if (await top.count()) await expect(top.first()).toContainText("A donor");

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Turn off" }).first().click();
    await expect(page.getByText("Off", { exact: true }).first()).toBeVisible();
    const after = await board.goto(link);
    expect(after?.status()).toBe(404);
    await anon.close();
  });

  test("a report opens and downloads as a spreadsheet", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/reports`);
    await page.getByRole("link", { name: /Gifts by fund/ }).click();
    await expect(page.getByRole("cell", { name: "General operating" }).first()).toBeVisible();
    await expectAccessible(page, "report");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download spreadsheet" }).click();
    const file = await (await download).path();
    const csv = (await readFile(file!, "utf8")).replace(/^﻿/, "");
    expect(csv.split("\r\n")[0]).toBe("Fund,Code,Gifts,Donors,Total");
    expect(csv).toContain("General operating");
  });

  test("thank-you emails arrive with the right words, and letters download as a PDF", async ({ page, request }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/acknowledgments`);
    await expectAccessible(page, "thank-you queue");
    const rows = page.getByRole("checkbox", { name: /Select \$100\.00 from Dana Rivera/ });
    await expect(rows.first()).toBeVisible();

    // Email two of Dana's gifts.
    await rows.nth(0).check();
    await rows.nth(1).check();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Send emails" }).click();
    await expect(page.getByText("2 sent")).toBeVisible();
    const search = await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:dana-${s.run}@example.org`)}`);
    const found = (await search.json()) as { messages: { ID: string; Subject: string }[] };
    expect(found.messages.length).toBeGreaterThanOrEqual(2);
    expect(found.messages[0]!.Subject).toBe(`Thank you for your gift to ${s.orgName}`);
    const msg = (await (await request.get(`${MAILPIT}/message/${found.messages[0]!.ID}`)).json()) as { Text: string };
    expect(msg.Text).toContain("Dear Dana,");
    expect(msg.Text).toContain("Thank you for your gift of $100.00");
    expect(msg.Text).toContain("No goods or services were provided in exchange for this contribution.");

    // Letters for the next one, downloaded and marked as thanked.
    await page.getByRole("checkbox", { name: /Select \$100\.00 from Dana Rivera/ }).first().check();
    page.once("dialog", (d) => d.accept());
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download letters (PDF)" }).click();
    const pages = await pdfText((await (await download).path())!);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain(s.orgName);
    expect(pages[0]).toContain("Dear Dana,");
    expect(pages[0]).toContain("$100.00");
  });
});
