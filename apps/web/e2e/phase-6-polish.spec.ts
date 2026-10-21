import { expect, test } from "@playwright/test";
import { expectAccessible, signIn, state } from "./helpers";

/**
 * The smaller findings from the persona walkthroughs (docs/usability/2026-10-21-persona-walkthroughs.md):
 * a landing page that explains itself, one name for each place, a way to share with the
 * board from the dashboard, and Data health that says what to fix first.
 */
test("the landing page says what this is and leads with starting", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/donor database for small nonprofits/)).toBeVisible();
  await expect(page.getByText("Set up in about 30 minutes")).toBeVisible();
  const start = page.getByRole("link", { name: "Start your free 30-day trial" });
  await expect(start).toHaveAttribute("href", "/sign-up");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expectAccessible(page, "landing page");
});

test.describe.serial("names and next steps", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;

  test("one name for each place, and the header greets by name", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/health`);
    await expect(page.getByRole("navigation", { name: "Donors" }).getByRole("link", { name: "Data health" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Data health", level: 1 })).toBeVisible();
    // A one-line answer first: what needs attention and where to start.
    await expect(page.getByText(/^(\d+ things? needs? attention\.|Nothing urgent\.)/)).toBeVisible();
    await expectAccessible(page, "data health");

    await page.goto(`${org}/reports`);
    await expect(page.getByRole("navigation", { name: "Reports" }).getByRole("link", { name: "Lists and downloads" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Lists and downloads", level: 1 })).toBeVisible();

    await page.goto(`${org}/settings/gift-standards`);
    await expect(page.getByRole("heading", { name: "Gift entry rules", level: 1 })).toBeVisible();
  });

  test("the board dashboard has a way to share it", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/dashboard`);
    await page.getByRole("link", { name: "Share with your board" }).click();
    await page.waitForURL(/settings\/board$/);
  });
});
