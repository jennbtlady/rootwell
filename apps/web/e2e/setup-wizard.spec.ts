import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./helpers";

/**
 * The guided setup for a brand-new organization (docs/usability/2026-10-21-persona-walkthroughs.md).
 * A new director signs up, creates an organization, and goes through every step. Each step must
 * pass the accessibility scan and fit a 375px phone. Progress must tick only real decisions.
 */
async function noSideways(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, `${label} scrolls sideways`).toBeLessThanOrEqual(1);
}

for (const width of [1280, 375]) {
  test(`a new organization is guided from sign-up to its first gift (${width}px)`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: 812 });
    const email = `e2e-wizard-${randomUUID().slice(0, 8)}@test.invalid`;
    await page.goto("/sign-up");
    await page.getByLabel("Your name").fill("Gloria Okonkwo");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(`e2e-${randomUUID()}`);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/app$/);
    await page.getByRole("link", { name: "Create organization" }).or(page.getByRole("button", { name: "Create organization" })).first().click();
    await page.getByLabel("Organization name").fill("Eastside Literacy Project");
    await page.getByRole("button", { name: "Create organization" }).click();
    await page.waitForURL(/\/app\/orgs\/[0-9a-f-]{36}$/, { timeout: 60_000 });

    // Home is the guide, not a dashboard of zeros.
    await expect(page.getByRole("heading", { name: /Welcome\. Let's get Eastside Literacy Project set up/ })).toBeVisible();
    await expect(page.getByText("Dollars this year")).toHaveCount(0);
    await expectAccessible(page, "setup home");
    await noSideways(page, "setup home");
    await page.getByRole("link", { name: "Start setup" }).click();

    // 1. About your organization
    await expect(page.getByRole("heading", { name: "About your organization", level: 1 })).toBeVisible();
    await expectAccessible(page, "profile step");
    await noSideways(page, "profile step");
    await page.getByLabel("EIN (federal tax ID)").fill("12-34");
    await page.getByLabel("Street").fill("410 Oak Avenue");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("An EIN looks like 12-3456789")).toBeVisible();
    await page.getByLabel("EIN (federal tax ID)").fill("123456789");
    await page.getByLabel("City").fill("Springfield");
    await page.getByLabel("State").fill("il");
    await page.getByLabel("ZIP code").fill("62704");
    await page.getByLabel("Your fiscal year starts in").selectOption({ label: "July" });
    await page.getByRole("button", { name: "Save and continue" }).click();

    // 2. Where gifts go
    await page.waitForURL(/step=funds/);
    await expectAccessible(page, "funds step");
    await noSideways(page, "funds step");
    await page.getByLabel("Programs").check();
    await page.getByLabel("Campaign name").fill("Spring reading drive");
    await page.getByLabel("Goal").fill("5000");
    await page.getByRole("button", { name: "Save and continue" }).click();

    // 3. How gifts are recorded
    await page.waitForURL(/step=rules/);
    await expect(page.getByLabel("Campaign filled in on new gifts")).toHaveValue(/[0-9a-f-]{36}/);
    await expectAccessible(page, "rules step");
    await noSideways(page, "rules step");
    await page.getByRole("button", { name: "Use these rules" }).click();

    // 4. Your donors, by hand
    await page.waitForURL(/step=donors/);
    await expectAccessible(page, "donors step");
    await page.getByRole("button", { name: /Add a few by hand/ }).click();
    await page.getByLabel("First name").first().fill("Maria");
    await page.getByLabel("Last name").first().fill("Lopez");
    await page.getByLabel("Email (optional)").first().fill("maria.lopez@example.org");
    await expectAccessible(page, "donors by hand");
    await noSideways(page, "donors by hand");
    await page.getByRole("button", { name: "Save and continue" }).click();

    // 5. Your team (skipped)
    await page.waitForURL(/step=team/);
    await expectAccessible(page, "team step");
    await page.getByRole("button", { name: "It's just me for now" }).click();

    // 6. Thank-you letter: opening it alone does not count as done.
    await page.waitForURL(/step=thanks/);
    await expect(page.getByLabel("Letter preview")).toContainText("Our EIN is 12-3456789");
    await expect(page.getByText("This step is done")).toHaveCount(0);
    await expectAccessible(page, "thanks step");
    await noSideways(page, "thanks step");
    await page.getByLabel("Who signs the letters?").fill("Gloria Okonkwo");
    await expect(page.getByLabel("Letter preview")).toContainText("Gloria Okonkwo");
    await page.getByRole("button", { name: /Looks good/ }).click();

    // Done: team is the only thing skipped.
    await page.waitForURL(/step=done/);
    await expect(page.getByText("skipped, you can do this later")).toHaveCount(1);
    await expectAccessible(page, "done step");
    await page.getByRole("link", { name: "Go to Home" }).click();

    // Home: ready for the first gift, and the gift form is filled in from setup.
    await expect(page.getByRole("heading", { name: "Ready for your first gift" })).toBeVisible();
    await expectAccessible(page, "home before first gift");
    await page.getByRole("link", { name: "Enter your first gifts" }).click();
    await page.getByRole("button", { name: "New batch" }).click();
    await page.getByRole("button", { name: "Start batch" }).click();
    await page.waitForURL(/batches\/[0-9a-f-]{36}/);
    await expect(page.getByLabel("Fund")).toHaveText(/General operating/);
    expect(await page.getByLabel("Fund").evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex]!.text)).toBe("General operating");
    expect(await page.getByLabel(/^Campaign/).evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex]!.text)).toBe("Spring reading drive");
  });
}

test("the gift form explains what to do when there are no funds yet", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-nofund-${randomUUID().slice(0, 8)}@test.invalid`;
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Sam Lee");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(`e2e-${randomUUID()}`);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app$/);
  await page.getByRole("link", { name: "Create organization" }).or(page.getByRole("button", { name: "Create organization" })).first().click();
  await page.getByLabel("Organization name").fill("Hillside Choir");
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL(/\/app\/orgs\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).getByRole("link", { name: "Gifts" }).click();
  await page.getByRole("button", { name: "New batch" }).click();
  await page.getByRole("button", { name: "Start batch" }).click();
  await page.waitForURL(/batches\/[0-9a-f-]{36}/);
  await expect(page.getByText("Add a fund before entering gifts")).toBeVisible();
  await page.getByRole("link", { name: "Add your funds" }).click();
  await page.waitForURL(/setup\?step=funds/);
});
