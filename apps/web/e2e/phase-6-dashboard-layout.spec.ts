import { expect, test, type Page } from "@playwright/test";
import { confirmIn, expectAccessible, signIn, signOut, state } from "./helpers";

/**
 * The customizable dashboards (docs/placeholders.md, section 3). Owners and admins choose
 * which cards show and in what order, one layout per organization for each view. Board
 * links follow the board layout.
 */
test.describe.serial("customizable dashboards", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;

  const h2s = (page: Page) => page.locator("main h2").allInnerTexts();

  test("an owner hides and reorders the cards on Home, by keyboard, at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, s.owner);
    await page.goto(org);
    await expect(page.getByRole("heading", { name: "Recent gifts" })).toBeVisible();
    await page.getByRole("button", { name: "Customize" }).click();
    await expect(page.getByRole("heading", { name: "Customize Home" })).toBeVisible();
    await expectAccessible(page, "customize home");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

    // Recent gifts to the top: focus stays on its Up button, so Enter keeps moving it.
    const up = page.getByRole("button", { name: "Move Recent gifts up" });
    await up.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press("Enter");
    await expect(page.getByText("Recent gifts moved to position 1 of 6.")).toBeAttached();
    await expect(page.getByRole("button", { name: "Move Recent gifts up" })).toBeDisabled();
    await page.getByRole("checkbox", { name: "Campaign goals" }).uncheck();
    await page.screenshot({ path: "test-results/customize-home-375.png", fullPage: true });
    await page.getByRole("button", { name: "Save layout" }).click();
    await expect(page.getByRole("heading", { name: "Customize Home" })).toHaveCount(0);

    // The page refreshes after saving; wait for the new order.
    await expect.poll(async () => { const o = await h2s(page); return o.indexOf("Recent gifts") < o.indexOf("To do"); }).toBe(true);
    expect(await h2s(page)).not.toContain("Campaign goals");

    // The layout belongs to the organization: it is still there after a reload.
    await page.reload();
    expect((await h2s(page)).indexOf("Recent gifts")).toBeLessThan((await h2s(page)).indexOf("To do"));
  });

  test("the board layout shows on Board dashboard and on board links", async ({ page, browser }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/dashboard`);
    await page.getByRole("button", { name: "Customize" }).click();
    await page.getByRole("checkbox", { name: "Dollars by month" }).uncheck();
    // Two steps up puts Largest gifts ahead of By fund.
    await page.getByRole("button", { name: "Move Largest gifts up" }).click();
    await page.getByRole("button", { name: "Move Largest gifts up" }).click();
    await page.getByRole("button", { name: "Save layout" }).click();
    await expect(page.getByRole("heading", { name: "Dollars by month" })).toHaveCount(0);

    await page.goto(`${org}/settings/board`);
    await page.getByRole("button", { name: "Make link" }).click();
    const link = (await page.locator("p.font-mono").first().innerText()).trim();
    const anon = await browser.newContext();
    const board = await anon.newPage();
    await board.goto(link);
    await expect(board.getByRole("heading", { name: "Board dashboard" })).toBeVisible();
    await expect(board.getByRole("heading", { name: "Dollars by month" })).toHaveCount(0);
    const order = await board.locator("main h2").allInnerTexts();
    expect(order.indexOf("Largest gifts this fiscal year")).toBeLessThan(order.indexOf("By fund this fiscal year"));
    await expectAccessible(board, "board link with a custom layout");
    await anon.close();
  });

  test("staff see the layout but cannot change it, and the standard layout comes back", async ({ page }) => {
    await signIn(page, s.staff);
    await page.goto(org);
    await expect(page.getByRole("heading", { name: "Recent gifts" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Customize" })).toHaveCount(0);

    await signOut(page);
    await signIn(page, s.owner);
    for (const path of [org, `${org}/dashboard`]) {
      await page.goto(path);
      await page.getByRole("button", { name: "Customize" }).click();
      await page.getByRole("button", { name: "Use the standard layout" }).click();
      await confirmIn(page, "Use the standard layout");
      await expect(page.getByText("Standard layout restored")).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Dollars by month" })).toBeVisible();
    await page.goto(org);
    await expect(page.getByRole("heading", { name: "Campaign goals" })).toBeVisible();
  });
});
