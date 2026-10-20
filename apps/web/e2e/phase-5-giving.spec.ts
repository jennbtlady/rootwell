import { expect, test } from "@playwright/test";
import { expectAccessible, signIn, state } from "./helpers";

/**
 * Phase 5 in the browser, against the built-in Stripe stand-in: connect Stripe, make a
 * giving page, give as a signed-out donor, and see the gift land on a new donor record.
 */
test.describe.serial("phase 5 online giving", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;
  const slug = `e2e-give-${s.run}`;
  const donor = { first: "Priya", last: `Natarajan${s.run.replace(/\d/g, "").slice(0, 4) || "x"}` };

  test("an owner connects Stripe in test mode", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/settings/integrations`);
    await expect(page.getByRole("heading", { name: "Integrations", level: 1 })).toBeVisible();
    await expectAccessible(page, "integrations");
    await page.getByRole("button", { name: "Connect Stripe" }).click();
    await expect(page.getByRole("heading", { name: "Connect your Stripe account" })).toBeVisible();
    await page.getByRole("button", { name: "Connect test account" }).click();
    await page.waitForURL(/settings\/integrations\?connected=stripe/);
    await expect(page.getByRole("button", { name: "Disconnect" }).first()).toBeVisible();
    await expect(page.getByText("Connected", { exact: true }).first()).toBeVisible();
  });

  test("an owner makes a giving page", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/settings/giving/new`);
    await page.getByLabel("Title").fill("Spring groceries");
    await page.getByLabel("Web address").fill(slug);
    await page.getByLabel("Message to donors").fill("Every $25 feeds a family for a week.");
    await expectAccessible(page, "giving page editor");
    await page.getByRole("button", { name: "Make page" }).click();
    await page.waitForURL(`**${org}/settings/giving`);
    await expect(page.getByRole("link", { name: new RegExp(`/give/${slug}`) })).toBeVisible();
  });

  test("a signed-out donor gives, and the gift lands on their new record", async ({ page, browser }) => {
    const anon = await browser.newContext();
    const give = await anon.newPage();
    await give.goto(`/give/${slug}`);
    await expect(give.getByRole("heading", { name: "Spring groceries" })).toBeVisible();
    await expectAccessible(give, "public giving page");
    await give.getByText("$50", { exact: true }).click();
    await give.getByRole("checkbox", { name: /cover the card fee/ }).uncheck();
    await give.getByRole("button", { name: "Give $50" }).click();

    await expect(give.getByText("Test mode.")).toBeVisible();
    await expectAccessible(give, "test checkout");
    await give.getByLabel("Name on card").fill(`${donor.first} ${donor.last}`);
    await give.getByLabel("Email").fill(`priya.${s.run}@example.org`);
    await give.getByLabel("Street address").fill("8 Willow Ct");
    await give.getByLabel("City").fill("Springfield");
    await give.getByLabel("State").fill("IL");
    await give.getByLabel("ZIP code").fill("62704");
    await give.getByRole("button", { name: "Pay $50.00" }).click();
    await give.waitForURL(`**/give/${slug}/thanks**`);
    await expect(give.getByRole("heading", { name: "Thank you" })).toBeVisible();
    await anon.close();

    await signIn(page, s.owner);
    await page.goto(`${org}/constituents?q=${encodeURIComponent(donor.last)}`);
    await page.getByRole("link", { name: new RegExp(donor.last) }).first().click();
    await expect(page.getByText("$50.00").first()).toBeVisible();
    await expect(page.getByText("1 gift")).toBeVisible();

    await page.goto(`${org}/health`);
    await expect(page.getByRole("heading", { name: "Integrations", level: 2 })).toBeVisible();
    await expect(page.getByText("Working")).toBeVisible();
  });

  test("the giving page fits a 375px screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/give/${slug}`);
    await expect(page.getByRole("button", { name: /Give/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await expectAccessible(page, "giving page on a phone");
  });
});
