import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, signIn, state } from "./helpers";

/**
 * Dana's trust issues from the persona walkthroughs (docs/usability/2026-10-21-persona-walkthroughs.md):
 * a deposit that does not add up is explained in dollars before anything is posted, and the
 * dashboard reflects a posted batch straight away, not the next morning.
 */
const dollarsThisYear = async (page: Page) => {
  const tile = page.getByText("Dollars this year").locator("xpath=ancestor::article[1]");
  return Number((await tile.innerText()).match(/\$([\d,]+\.\d{2})/)![1]!.replace(/,/g, ""));
};

test.describe.serial("Dana: the numbers match the bank", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;

  test("a short deposit is explained, can be corrected, and the dashboard updates at once", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, s.owner);
    await page.goto(`${org}/dashboard`);
    const before = await dollarsThisYear(page);

    await page.goto(`${org}/batches`);
    await page.getByRole("button", { name: "New batch" }).click();
    await page.getByLabel("Description").fill("Trust check deposit");
    await page.getByLabel("Expected total").fill("200");
    await page.getByLabel("Expected number of gifts").fill("2");
    await page.getByRole("button", { name: "Start batch" }).click();
    await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/);

    const donor = page.getByRole("combobox", { name: /Donor/ });
    for (const [amount, check] of [["100", "2001"], ["75", "2002"]] as const) {
      await donor.fill("Dana");
      await page.getByRole("option", { name: /Dana Rivera/ }).click();
      await page.getByLabel(/Amount/).fill(amount);
      await page.getByRole("combobox", { name: /Campaign/ }).selectOption({ label: "Spring appeal" });
      await page.getByLabel(/Check number/).fill(check);
      await page.getByRole("button", { name: "Save gift and add another" }).click();
      await expect(page.getByText(`$${amount}.00 from Dana Rivera saved.`)).toBeVisible();
    }
    // The difference shows while working, in dollars.
    await expect(page.getByText("$25.00 short of the deposit slip ($200.00)")).toBeVisible();
    await expect(page.getByText("All 2 gifts on the slip")).toBeVisible();

    // Posting a mismatch: the first choice is to go back and check.
    await page.getByRole("button", { name: "Post batch" }).click();
    const dialog = page.getByRole("dialog", { name: "This batch does not match the deposit slip" });
    await expect(dialog).toContainText("That is $25.00 short");
    await expectAccessible(page, "mismatch dialog");
    await dialog.getByRole("button", { name: "Go back and check" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Open", { exact: true }).first()).toBeVisible();

    // The slip total was typed wrong: correct it and post.
    await page.getByRole("button", { name: "Post batch" }).click();
    await dialog.getByRole("button", { name: "The slip was wrong" }).click();
    await dialog.getByLabel("Deposit slip total").fill("175");
    await dialog.getByRole("button", { name: "Correct and post" }).click();
    await expect(page.getByText(/are final\. Next: thank these donors\./)).toBeVisible();
    await expect(page.getByText("Matches the deposit slip")).toBeVisible();

    // The board dashboard shows the new gifts now, without waiting for the nightly run.
    await page.goto(`${org}/dashboard`);
    expect(await dollarsThisYear(page)).toBeCloseTo(before + 175, 2);
  });

  test("year-end statements go out once, and the page remembers", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, s.owner);
    const year = new Date().getFullYear();
    await page.goto(`${org}/acknowledgments/statements?year=${year}`);
    const send = page.getByRole("button", { name: /^Email \d+ not yet sent$/ });
    await expect(send).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await send.click();
    await expect(page.getByText(/statements? sent/).first()).toBeVisible();
    await page.reload();
    // After a reload the page still knows: nothing left to send, every row says when.
    await expect(page.getByText("Everyone with email has theirs")).toBeVisible();
    await expect(page.getByRole("button", { name: /not yet sent/ })).toHaveCount(0);
    await expect(page.getByText(/^Emailed [A-Z][a-z]{2} \d{1,2}, \d{4}$/).first()).toBeVisible();
    await expectAccessible(page, "statements after sending");
  });
});
