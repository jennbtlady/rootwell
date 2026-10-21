import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, signIn, state } from "./helpers";

/**
 * Dana's gift form findings from the persona walkthroughs (docs/usability/2026-10-21-persona-walkthroughs.md):
 * a gift in an open batch can be corrected in place, adding a new donor keeps the typed name
 * and comes back to the batch, and saving a likely duplicate gets a second look.
 */
test.describe.serial("Dana: the gift form", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;
  let batch = "";

  async function chooseDonor(page: Page, q: string, name: RegExp) {
    await page.getByRole("combobox", { name: /Donor/ }).fill(q);
    await page.getByRole("option", { name }).click();
  }

  test("a gift in an open batch is edited in place", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, s.owner);
    await page.goto(`${org}/batches`);
    await page.getByRole("button", { name: "New batch" }).click();
    await page.getByLabel("Description").fill("Dana gift form check");
    await page.getByRole("button", { name: "Start batch" }).click();
    await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/);
    batch = page.url();

    // A required campaign starts on "Choose a campaign", not "None".
    // The phase 1 test makes campaign required for this organization.
    const campaign = page.getByRole("combobox", { name: "Required, Campaign" });
    expect(await campaign.evaluate((el: HTMLSelectElement) => el.options[0]!.text)).toBe("Choose a campaign");

    await chooseDonor(page, "Dana", /Dana Rivera/);
    await page.getByLabel(/Amount/).fill("25");
    await campaign.selectOption({ label: "Spring appeal" });
    await page.getByLabel(/Check number/).fill("5001");
    await page.getByRole("button", { name: "Save gift and add another" }).click();
    await expect(page.getByText("$25.00 from Dana Rivera saved.")).toBeVisible();

    await page.getByRole("button", { name: "Edit the $25.00 gift from Dana Rivera" }).click();
    await expect(page.getByRole("heading", { name: "Edit the $25.00 gift from Dana Rivera" })).toBeVisible();
    await expect(page.getByLabel(/Amount/)).toHaveValue("25.00");
    await expect(page.getByLabel(/Check number/)).toHaveValue("5001");
    await expect(page.getByText("Editing above")).toBeVisible();
    await expectAccessible(page, "editing a gift");
    await page.getByLabel(/Amount/).fill("35");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("cell", { name: "$35.00", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "$25.00", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Enter a gift" })).toBeVisible();
  });

  test("adding a new donor keeps the typed name and comes back to the batch", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(batch);
    await page.getByRole("combobox", { name: /Donor/ }).fill("Zelda Quill");
    await page.getByRole("link", { name: "Add “Zelda Quill” as a new donor" }).click();
    await expect(page.getByText("After saving, you go back to the batch with this donor filled in.")).toBeVisible();
    await expect(page.getByLabel("First name")).toHaveValue("Zelda");
    await expect(page.getByLabel("Last name")).toHaveValue("Quill");
    await page.getByRole("textbox", { name: /^Email/ }).fill("zelda.quill.e2e@example.org");
    await page.getByRole("button", { name: "Add donor" }).click();
    await page.waitForURL(/\/batches\/[0-9a-f-]{36}\?constituent=/);
    await expect(page.getByRole("combobox", { name: /Donor/ })).toHaveValue("Zelda Quill");
    await expect(page.getByLabel(/Amount/)).toBeFocused();
  });

  test("a likely duplicate gets a second look before it is saved", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, s.owner);
    await page.goto(batch);
    await page.getByRole("combobox", { name: /Donor/ }).fill("Zee Quill");
    await page.getByRole("link", { name: /as a new donor/ }).click();
    const email = page.getByRole("textbox", { name: /^Email/ });
    await email.fill("zelda.quill.e2e@example.org");
    // D-f: the field being typed in stays above the bottom tab bar.
    const field = (await email.boundingBox())!;
    const bar = (await page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).boundingBox())!;
    expect(field.y + field.height).toBeLessThanOrEqual(bar.y);
    await expect(page.getByText("This might already be in your database")).toBeVisible();
    await page.getByRole("button", { name: "Add donor" }).click();
    await expect(page.getByText("Is this Zelda Quill, who is already in your database?")).toBeVisible();
    await expectAccessible(page, "duplicate second check");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.getByRole("link", { name: "Use Zelda Quill" }).click();
    await page.waitForURL(/\/batches\/[0-9a-f-]{36}\?constituent=/);
    await expect(page.getByRole("combobox", { name: /Donor/ })).toHaveValue("Zelda Quill");
  });

  test("the donor page counts the fiscal year, like Home", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/constituents?q=Rivera`);
    await page.getByRole("link", { name: /Rivera, Dana/ }).first().click();
    await expect(page.getByText("This fiscal year", { exact: true })).toBeVisible();
    await expect(page.getByText("Last fiscal year", { exact: true })).toBeVisible();

    // Leave the shared test organization as it was.
    await page.goto(batch);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Remove the \$35\.00 gift/ }).click();
    await expect(page.getByRole("cell", { name: "$35.00", exact: true })).toHaveCount(0);
  });
});
