import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, signIn, state } from "./helpers";

/**
 * Phase 3 acceptance in the browser: upload, match columns, fix problems, review matches,
 * import, roll back. Then a 5,000-row file of people plus gifts, timed.
 */
test.describe.serial("phase 3 import wizard", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;

  async function upload(page: Page, file: string) {
    await page.goto(`${org}/imports/new`);
    await page.getByLabel("Spreadsheet").setInputFiles(path.join(__dirname, "fixtures", file));
    await expect(page.getByRole("button", { name: "Continue to matching columns" })).toBeVisible();
  }

  /** Waits for the review step or the final step, and clears review if it appears. */
  async function finishReview(page: Page, timeout = 60_000) {
    const review = page.getByRole("button", { name: "Add all as new people" });
    const commit = page.getByRole("button", { name: /Import [\d,]+ people/ });
    await expect(review.or(commit)).toBeVisible({ timeout });
    if (await review.isVisible()) {
      await expectAccessible(page, "review matches");
      await review.click();
      await expect(commit).toBeVisible({ timeout });
    }
  }

  test("a messy file goes through every step and rolls back", async ({ page }) => {
    await signIn(page, s.owner);
    await upload(page, "messy-import.csv");
    await expect(page.getByText("12", { exact: true })).toBeVisible();
    await expectAccessible(page, "import upload");
    await page.getByRole("button", { name: "Continue to matching columns" }).click();

    // Columns were matched automatically.
    await expect(page.getByLabel("Field for Donor ID")).toHaveValue("legacy_id");
    await expect(page.getByLabel("Field for Check No")).toHaveValue("check_number");
    await expectAccessible(page, "column matching");
    await page.getByRole("button", { name: "Check 12 rows" }).click();

    // Problems: fix the bad email in place, then skip the rest.
    await expect(page.getByText(/rows have a problem/)).toBeVisible();
    await expectAccessible(page, "fix problems");
    const row4 = page.getByRole("listitem").filter({ hasText: "Row 4" });
    await row4.getByLabel("Email").fill("tom.e2e@example.org");
    await row4.getByRole("button", { name: "Save fix" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Row 4" })).toHaveCount(0);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Skip all \d+ rows with problems/ }).click();

    await finishReview(page);
    await expect(page.getByRole("button", { name: /Import \d+ people/ })).toBeVisible();
    await expectAccessible(page, "import summary");
    await page.getByRole("button", { name: /Import \d+ people/ }).click();
    await expect(page.getByText(/Imported on/)).toBeVisible();
    await expectAccessible(page, "import done");

    // Dana Rivera appears twice in the file and became one person with two gifts.
    await page.goto(`${org}/constituents?q=${encodeURIComponent("dana.e2e@example.org")}`);
    await page.getByRole("link", { name: "Rivera, Dana" }).click();
    await expect(page.getByRole("tab", { name: "Gifts (2)" })).toBeVisible();

    await page.goBack();
    await page.goto(`${org}/imports`);
    await page.getByRole("link", { name: "messy-import.csv" }).first().click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Roll back this import" }).click();
    await expect(page.getByText(/was rolled back/)).toBeVisible();
    await page.goto(`${org}/constituents?q=${encodeURIComponent("dana.e2e@example.org")}`);
    await expect(page.getByText("No one matches that search")).toBeVisible();
  });

  test("5,000 rows of people and gifts import in under two minutes", async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, s.owner);
    const started = Date.now();
    await upload(page, "import-5000.csv");
    await page.getByRole("button", { name: "Continue to matching columns" }).click();
    await page.getByRole("button", { name: "Check 5,000 rows" }).click({ timeout: 60_000 });
    await finishReview(page, 90_000);
    await page.getByRole("button", { name: /Import [\d,]+ people/ }).click({ timeout: 60_000 });
    await expect(page.getByText(/Imported on/)).toBeVisible({ timeout: 120_000 });
    const seconds = (Date.now() - started) / 1000;
    console.log(`5,000-row import in the browser: ${seconds.toFixed(1)}s`);
    expect(seconds).toBeLessThan(120);
    await expect(page.getByText("5,000", { exact: true })).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Roll back this import" }).click();
    await expect(page.getByText(/was rolled back/)).toBeVisible({ timeout: 60_000 });
  });
});
