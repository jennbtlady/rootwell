import { expect, test } from "@playwright/test";
import { confirmIn, expectAccessible, signIn, state } from "./helpers";

/**
 * Fundraising Phase 2 in the browser: an owner adds an animal to sponsor and edits the
 * receipt, makes a giving page that offers tributes, a message and the animal, and a donor
 * on a phone-sized screen sponsors the animal in memory of a pet. The gift shows its extras.
 *
 * This file runs before phase-5-giving.spec.ts, which connects Stripe itself, so it connects
 * Stripe here and disconnects it at the end.
 */
test.describe.serial("fundraising phase 2: donations", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;
  const slug = `e2e-animals-${s.run}`;
  const animal = `Pippin ${s.run.slice(-4)}`;

  test("an owner adds an animal to sponsor", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/settings`);
    await page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Animals to sponsor" }).click();
    await expect(page.getByRole("heading", { name: "Animals to sponsor", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Add an animal" }).click();
    await page.getByRole("textbox", { name: /Name$/ }).fill(animal);
    await page.getByLabel("A sentence about them").fill("A shy tabby who loves sunny windows.");
    await expectAccessible(page, "animals to sponsor");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(animal, { exact: true })).toBeVisible();
    await expect(page.getByText("0 gifts so far.")).toBeVisible();
  });

  test("an owner edits the receipt and sees the preview follow", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/settings/receipts`);
    await expect(page.getByRole("heading", { name: "Online receipts", level: 1 })).toBeVisible();
    await expectAccessible(page, "online receipts");
    await page.getByLabel("Thank-you").fill("Every tail wags because of you.");
    await expect(page.getByLabel("Receipt preview")).toContainText("Every tail wags because of you.");
    await expect(page.getByLabel("Receipt preview")).toContainText("No goods or services were provided");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("New receipts use these words.")).toBeVisible();
  });

  test("an owner makes a giving page with tributes, messages and the animal", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/settings/integrations`);
    await page.getByRole("button", { name: "Connect Stripe" }).click();
    await page.getByRole("button", { name: "Connect test account" }).click();
    await page.waitForURL(/settings\/integrations\?connected=stripe/);

    await page.goto(`${org}/settings/giving/new`);
    await page.getByLabel("Title").fill("Sponsor a shelter pet");
    await page.getByLabel("Web address").fill(slug);
    await page.getByRole("checkbox", { name: "Let donors give in honor or memory of someone" }).check();
    await page.getByRole("checkbox", { name: "Let donors leave a message" }).check();
    await page.getByRole("checkbox", { name: animal }).check();
    await expectAccessible(page, "giving page editor with animals");
    await page.getByRole("button", { name: "Make page" }).click();
    await page.waitForURL(`**${org}/settings/giving`);
  });

  test("a donor on a phone sponsors the animal in memory of a pet", async ({ browser }) => {
    const anon = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const give = await anon.newPage();
    await give.goto(`/give/${slug}`);
    await expect(give.getByRole("heading", { name: "Sponsor a shelter pet" })).toBeVisible();
    await give.getByText(`Sponsor ${animal}`).click();
    await give.getByRole("checkbox", { name: "Give in honor or memory of someone" }).check();
    await give.getByText("In memory of", { exact: true }).click();
    await give.getByRole("textbox", { name: /Their name$/ }).fill("Biscuit");
    await give.getByLabel(/A message for/).fill("For the shy ones.");
    await expectAccessible(give, "giving page with tribute and animal");
    expect(await give.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    // Keyboard: the tribute name field is reachable and typed into without a mouse.
    await give.getByRole("textbox", { name: /Their name$/ }).focus();
    await give.keyboard.press("Tab");
    await expect(give.getByLabel(/Let someone know/)).toBeFocused();

    await give.getByText("$50", { exact: true }).click();
    await give.getByRole("checkbox", { name: /cover the card fee/ }).uncheck();
    await give.getByRole("button", { name: "Give $50" }).click();
    await expect(give.getByText("sponsor " + animal)).toBeVisible();
    await give.getByLabel("Name on card").fill(`Riley Dunn${s.run.slice(-3)}`);
    await give.getByLabel("Email").fill(`riley.${s.run}@example.org`);
    await give.getByLabel("Street address").fill("9 Water St");
    await give.getByLabel("City").fill("Hallowell");
    await give.getByLabel("State").fill("ME");
    await give.getByLabel("ZIP code").fill("04347");
    await give.getByRole("button", { name: "Pay $50.00" }).click();
    await give.waitForURL(`**/give/${slug}/thanks**`);
    await expect(give.getByText("A receipt is on its way to your email.")).toBeVisible();
    await anon.close();
  });

  test("staff see the gift's animal, tribute and message, and the receipt counts as thanked", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/gifts`);
    await expect(page.getByText(`Sponsoring ${animal}. In memory of Biscuit`).first()).toBeVisible();
    await expect(page.getByText("“For the shy ones.”").first()).toBeVisible();

    // Leave Stripe disconnected for phase-5-giving.spec.ts.
    await page.goto(`${org}/settings/integrations`);
    await page.getByRole("button", { name: "Disconnect" }).first().click();
    await confirmIn(page, "Disconnect Stripe");
    await expect(page.getByRole("button", { name: "Connect Stripe" })).toBeVisible();
  });
});
