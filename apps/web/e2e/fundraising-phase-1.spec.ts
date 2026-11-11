import { expect, test } from "@playwright/test";
import { expectAccessible, signIn, state } from "./helpers";

/**
 * Fundraising Phase 1 in the browser: an owner sets the look of public pages, sees contrast
 * warnings for colors that are hard to read, and sees the preview follow the colors. The
 * embed and module checks are covered by the API tests and security-headers.spec.ts.
 */
test.describe.serial("fundraising phase 1: public page look", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;

  test("an owner sets brand colors, with warnings and a live preview", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/settings`);
    await page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Public page look" }).click();
    await expect(page.getByRole("heading", { name: "Public page look", level: 1 })).toBeVisible();
    await expectAccessible(page, "public page look");

    // A pale yellow main color is hard to read: the form says so, and still lets you save.
    const main = page.getByRole("textbox", { name: "Main color", exact: true });
    await main.fill("#FFD43B");
    await expect(page.getByText("Links in this color are hard to read on a white page")).toBeVisible();
    await expect(page.getByText("Some people may find these colors hard to read")).toBeVisible();

    // A dark green reads well. The preview's Give button turns green.
    await main.fill("#1F5E3B");
    await expect(page.getByText("Some people may find these colors hard to read")).toHaveCount(0);
    const give = page.locator("[inert]").getByRole("button", { name: "Give $50" });
    await expect(give).toHaveCSS("background-color", "rgb(31, 94, 59)");
    await expect(page.locator("[inert]").getByText("Powered by Rootwell")).toBeVisible();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Your public pages use this look now.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Main color", exact: true })).toHaveValue("#1F5E3B");
  });

  test("a bad color says what to type", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/settings/branding`);
    await page.getByRole("textbox", { name: "Accent color", exact: true }).fill("green");
    await expect(page.getByText("Use a color like #1A6B3C").first()).toBeVisible();
  });
});
