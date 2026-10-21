import { expect, test } from "@playwright/test";
import { expectAccessible, signIn, state } from "./helpers";

/**
 * Ruth's findings from the persona walkthroughs (docs/usability/2026-10-21-persona-walkthroughs.md):
 * the board treasurer must be able to trust that a download matches the page, read the
 * definitions on a phone, and know who else can see the board link.
 */
test.describe.serial("Ruth: the board view can be trusted", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;

  test("a fund report starts at the fiscal year and says its dates", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/reports/gifts_by_fund`);
    await expect(page.getByText(/^Gifts dated .+ through .+\./)).toBeVisible();
    await expect(page.getByText("This starts on the first day of your fiscal year.")).toBeVisible();
    // The filter shows the same start date the report used.
    const from = await page.getByLabel("From").inputValue();
    expect(from).toMatch(/^\d{4}-\d{2}-01$/);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download spreadsheet" }).click();
    expect((await download).suggestedFilename()).toContain(`-${from}-to-`);
    // The total row has gift and donor counts, not blanks.
    const total = page.getByRole("row", { name: /All funds/ });
    await expect(total).toContainText(/\d/);
    await expect(total.getByRole("cell").nth(2)).not.toBeEmpty();
  });

  test("definitions open one at a time and close with a tap elsewhere", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, s.owner);
    await page.goto(`${org}/dashboard`);
    const dollars = page.getByRole("button", { name: "How dollars this fiscal year is counted" });
    const retention = page.getByRole("button", { name: "How donor retention is counted" });
    const box = await dollars.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await dollars.click();
    await expect(dollars).toHaveAttribute("aria-expanded", "true");
    await retention.click();
    await expect(retention).toHaveAttribute("aria-expanded", "true");
    await expect(dollars).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator('[role="tooltip"][data-state="open"]')).toHaveCount(1);
    // Plain words first; the method name comes last.
    await expect(page.locator('[role="tooltip"][data-state="open"]')).toHaveText(/^Of the donors who gave in one fiscal year/);

    await page.getByRole("heading", { name: "Board dashboard", level: 1 }).click();
    await expect(retention).toHaveAttribute("aria-expanded", "false");
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });

  test("the board page says who can see it, and prints the definitions", async ({ page, browser }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/settings/board`);
    await page.getByRole("button", { name: "Make link" }).click();
    const link = (await page.locator("p.font-mono").first().innerText()).trim();
    const anon = await browser.newContext();
    const board = await anon.newPage();
    await board.goto(link);
    await expect(board.getByText(/^Anyone with this link can see this page/)).toBeVisible();
    await expect(board.getByText(/^Fiscal year to date, [A-Z][a-z]{2} \d{1,2}, \d{4} through/)).toBeVisible();
    await expect(board.getByText(/\d+ new and \d+ returning/)).toBeVisible();
    await expect(board.getByText("How these numbers are counted")).toBeHidden();
    await board.emulateMedia({ media: "print" });
    await expect(board.getByText("How these numbers are counted")).toBeVisible();
    await board.emulateMedia({ media: "screen" });
    await expectAccessible(board, "board link with privacy note");
    await anon.close();
  });
});
