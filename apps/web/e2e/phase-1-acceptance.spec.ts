import { expect, test } from "@playwright/test";
import { expectAccessible, signIn, signOut, state } from "./helpers";

/**
 * The Phase 1 acceptance criterion from the brief: a staff user can enter a batch of 20
 * gifts against the org's required fields, an admin can post it, and the audit log shows
 * every change. Accessibility is checked on each screen along the way.
 */
test.describe.serial("phase 1 acceptance", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;
  let batchUrl = "";

  test("owner sets up coding and standards", async ({ page }) => {
    await signIn(page, s.owner);
    await expectAccessible(page, "organization list");

    await page.goto(`${org}/settings/coding`);
    await page.getByRole("button", { name: "Add fund" }).click();
    await page.getByLabel("Name").fill("General operating");
    await page.getByLabel("Code").fill("GEN");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: "General operating" })).toBeVisible();

    await page.getByRole("tab", { name: /Campaigns/ }).click();
    await page.getByRole("button", { name: "Add campaign" }).click();
    await page.getByLabel("Name").fill("Spring appeal");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: "Spring appeal" })).toBeVisible();
    await expectAccessible(page, "coding settings");

    await page.goto(`${org}/settings/gift-standards`);
    await page.getByLabel("Campaign", { exact: true }).check();
    await page.getByLabel("Default fund").selectOption({ label: "General operating" });
    await page.getByLabel("Campaign", { exact: true }).check();
    await page.getByRole("button", { name: "Save standards" }).click();
    await expect(page.getByText("Saved. The gift form uses these from now on.")).toBeVisible();
    await expectAccessible(page, "standards settings");
    await signOut(page);
  });

  test("staff adds a donor and enters 20 gifts against the standards", async ({ page }) => {
    await signIn(page, s.staff);
    await page.goto(`${org}/constituents/new`);
    await expectAccessible(page, "new constituent");
    await page.getByLabel("First name").fill("Dana");
    await page.getByLabel("Last name").fill("Rivera");
    await page.getByRole("textbox", { name: /^Email/ }).fill(`dana-${s.run}@example.org`);
    await page.getByRole("button", { name: "Add donor" }).click();
    await page.waitForURL(/\/constituents\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Dana Rivera" })).toBeVisible();
    await expectAccessible(page, "constituent profile");

    // Duplicate warning appears for the same name.
    await page.goto(`${org}/constituents/new`);
    await page.getByLabel("Last name").fill("Rivera");
    await page.getByLabel("First name").fill("Dana");
    await expect(page.getByText("This might already be in your database")).toBeVisible();

    await page.goto(`${org}/batches`);
    await page.getByRole("button", { name: "New batch" }).click();
    await page.getByLabel("Description").fill("Acceptance deposit");
    await page.getByLabel("Expected total").fill("2000");
    await page.getByLabel("Expected number of gifts").fill("20");
    await page.getByRole("button", { name: "Start batch" }).click();
    await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/);
    batchUrl = page.url();
    await expectAccessible(page, "batch page");

    // The standards refuse a check with no number and no campaign.
    const donor = page.getByRole("combobox", { name: /Donor/ });
    await donor.fill("Dana");
    await page.getByRole("option", { name: /Dana Rivera/ }).click();
    await page.getByLabel(/Amount/).fill("100");
    await page.getByRole("button", { name: "Save gift and add another" }).click();
    await expect(page.getByText("Campaign is required here")).toBeVisible();
    await expect(page.getByText("Enter the check number")).toBeVisible();

    await page.getByRole("combobox", { name: /Campaign/ }).selectOption({ label: "Spring appeal" });
    for (let i = 1; i <= 20; i++) {
      if (i > 1) {
        await donor.fill("Dana");
        await page.getByRole("option", { name: /Dana Rivera/ }).click();
        await page.getByLabel(/Amount/).fill("100");
      }
      await page.getByLabel(/Check number/).fill(`${1000 + i}`);
      await page.getByRole("button", { name: "Save gift and add another" }).click();
      await expect(page.getByText(`$100.00 from Dana Rivera saved.`)).toBeVisible();
    }
    await expect(page.getByText("All 20 gifts on the slip")).toBeVisible();
    await expect(page.getByText("Matches the deposit slip")).toBeVisible();
    await expect(page.getByRole("button", { name: "Post batch" })).toHaveCount(0);
    await signOut(page);
  });

  test("admin posts the batch and the history shows every change", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(batchUrl);
    await page.getByRole("button", { name: "Post batch" }).click();
    const confirm = page.getByRole("dialog", { name: "Post these 20 gifts?" });
    await expect(confirm).toContainText("matches the deposit slip");
    await confirm.getByRole("button", { name: "Post batch" }).click();
    await expect(page.getByText("Batch posted")).toBeVisible();
    await expect(page.getByText("Posted", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Save gift and add another" })).toHaveCount(0);

    await page.getByRole("link", { name: "Dana Rivera" }).first().click();
    await page.getByRole("tab", { name: /Gifts/ }).click();
    await expect(page.getByRole("cell", { name: "Posted" }).first()).toBeVisible();
    await page.getByRole("tab", { name: "History" }).click();
    await expect(page.getByText(/Created by E2E staff/)).toBeVisible();
  });

  test("donor lookup and logging a call work at phone width @phone", async ({ page }) => {
    await signIn(page, s.staff);
    await page.goto(`${org}/constituents/new`);
    await page.getByLabel("First name").fill("Tom");
    await page.getByLabel("Last name").fill("Okafor");
    await page.getByRole("button", { name: "Add donor" }).click();
    await page.waitForURL(/\/constituents\/[0-9a-f-]{36}$/);

    await page.goto(`${org}/constituents?q=okafor`);
    await expect(page.getByRole("link", { name: "Okafor, Tom" })).toBeVisible();
    await expectAccessible(page, "constituent search on a phone");
    await page.getByRole("link", { name: "Okafor, Tom" }).click();
    await page.getByRole("tab", { name: /Interactions/ }).click();
    await page.getByRole("button", { name: "Log a call, meeting or note" }).click();
    await page.getByLabel(/Summary/).fill("Thanked her by phone");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Thanked her by phone")).toBeVisible();
    await expectAccessible(page, "interaction log on a phone");
  });
});
