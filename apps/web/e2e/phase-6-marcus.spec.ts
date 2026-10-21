import { expect, test } from "@playwright/test";
import { expectAccessible, signIn, state, confirmIn } from "./helpers";

/**
 * Marcus's findings from the persona walkthroughs (docs/usability/2026-10-21-persona-walkthroughs.md).
 * The import questions and the Past imports link are covered in phase-3-import.spec.ts. This
 * covers the rest: gifts not yet posted are explained where people look for them, and the
 * "gave last year, not this year" download works for a mailing.
 */
test.describe.serial("Marcus: the lists can be used", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;

  test("Thank-yous explains gifts that are waiting in an unposted batch", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, s.owner);
    await page.goto(`${org}/batches`);
    await page.getByRole("button", { name: "New batch" }).click();
    await page.getByLabel("Description").fill("Marcus unposted check");
    await page.getByRole("button", { name: "Start batch" }).click();
    await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/);
    const batch = page.url();
    await page.getByRole("combobox", { name: /Donor/ }).fill("Dana");
    await page.getByRole("option", { name: /Dana Rivera/ }).click();
    await page.getByLabel(/Amount/).fill("40");
    await page.getByRole("combobox", { name: /Campaign/ }).selectOption({ label: "Spring appeal" });
    await page.getByLabel(/Check number/).fill("4040");
    await page.getByRole("button", { name: "Save gift and add another" }).click();
    await expect(page.getByText("$40.00 from Dana Rivera saved.")).toBeVisible();

    await page.goto(`${org}/acknowledgments`);
    await expect(page.getByText(/^\d+ gifts? (is|are) in .* not posted yet\./)).toBeVisible();
    await expectAccessible(page, "thank-yous with unposted gifts");
    await page.getByRole("link", { name: "Go to batches" }).click();
    await page.waitForURL(/\/batches$/);

    // Leave the shared test organization as it was.
    await page.goto(batch);
    await page.getByRole("button", { name: "Remove" }).first().click();
    await confirmIn(page, "Remove gift");
    await expect(page.getByText("$40.00 from Dana Rivera")).toHaveCount(0);
  });

  test("the gave-last-year list says its download is ready for a mailing", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/reports/lybunt`);
    const note = page.getByText(/mailing addresses, and who asked not to be mailed/);
    const empty = page.getByRole("heading", { name: "No one on this list" });
    await expect(note.or(empty)).toBeVisible();
    // Address columns are in the file only, so the table stays readable on a phone.
    await expect(page.getByRole("columnheader", { name: "Address line 1" })).toHaveCount(0);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download spreadsheet" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  });
});
