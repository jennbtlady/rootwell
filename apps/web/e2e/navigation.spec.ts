import { expect, test } from "@playwright/test";
import { expectAccessible, signIn, state } from "./helpers";

/**
 * docs/navigation-standard.md: three to five main areas named for tasks, always visible,
 * no more than three levels, admin behind a labeled Settings link.
 */
test.describe("navigation standard", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;
  const AREAS = ["Home", "Donors", "Gifts", "Thank-yous", "Reports"];

  test("five main areas are always visible on a computer, and Settings is labeled", async ({ page }) => {
    await signIn(page, s.owner);
    for (const path of [org, `${org}/constituents`, `${org}/batches`, `${org}/dashboard`, `${org}/settings/team`]) {
      await page.goto(path);
      const main = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
      await expect(main.getByRole("link")).toHaveText(AREAS);
      await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    }
    await page.goto(`${org}/health`);
    await expect(page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).getByRole("link", { name: "Donors" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Donors" }).getByRole("link", { name: "Data health" })).toHaveAttribute("aria-current", "page");
  });

  test("on a 375px phone the main areas sit in a bottom tab bar and settings is a list", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, s.owner);
    await page.goto(`${org}/constituents`);
    const bar = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    await expect(bar.getByRole("link")).toHaveText(AREAS);
    const box = await bar.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(780);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.waitForURL(`**${org}/settings`);
    await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Team" })).toBeVisible();
    await expectAccessible(page, "settings list on a phone");
    await page.getByRole("link", { name: "Billing" }).click();
    await expect(page.getByRole("heading", { name: "Billing", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Settings" })).toBeHidden();
    await page.getByRole("link", { name: "All settings" }).click();
    await page.waitForURL(`**${org}/settings`);
  });

  test("staff see the five areas but no Settings link", async ({ page }) => {
    await signIn(page, s.staff);
    await page.goto(org);
    await expect(page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).getByRole("link")).toHaveText(AREAS);
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
  });
});
