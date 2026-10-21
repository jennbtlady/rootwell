import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, signIn, state } from "./helpers";

/**
 * Phase 6 mobile browser pass: every form, on iPhone Safari (WebKit) and Android Chrome.
 * Each page must not scroll sideways, must pass the accessibility scan, and every text
 * field must use at least 16px type (smaller makes iPhone Safari zoom in on tap).
 * The everyday forms are also filled in and sent.
 */
async function checkPage(page: Page, label: string) {
  await expect(page.locator("main")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea")]
      .filter((el) => el.offsetParent !== null && parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${el.tagName.toLowerCase()}#${el.id || el.getAttribute("name") || "?"} ${getComputedStyle(el).fontSize}`),
  );
  expect(small, `${label} has fields under 16px, which iPhone Safari zooms into`).toEqual([]);
  await expectAccessible(page, label);
}

test.describe.serial("every form on a phone @mobile", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;

  test("signed-out forms", async ({ page }) => {
    for (const [path, label] of [
      ["/sign-in", "sign in"],
      ["/sign-up", "sign up"],
    ] as const) {
      await page.goto(path);
      await checkPage(page, label);
    }
  });

  test("an owner's forms all fit and pass", async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, s.owner);
    for (const [path, label] of [
      ["/app/orgs/new", "new organization"],
      [`${org}/constituents`, "donor search"],
      [`${org}/constituents/new`, "add donor"],
      [`${org}/batches`, "new batch"],
      [`${org}/imports`, "import upload"],
      [`${org}/reports`, "report filters"],
      [`${org}/acknowledgments/templates`, "thank-you templates"],
      [`${org}/settings/team`, "team invite"],
      [`${org}/settings/coding`, "funds"],
      [`${org}/settings/gift-standards`, "gift entry rules"],
      [`${org}/settings/giving/new`, "giving page editor"],
      [`${org}/settings/integrations`, "integrations"],
      [`${org}/settings/board`, "board sharing"],
      [`${org}/settings/billing`, "billing"],
      [`${org}/settings/account`, "account and export"],
    ] as const) {
      await page.goto(path);
      await checkPage(page, label);
    }
  });

  test("add a donor and start a batch on a phone", async ({ page }, info) => {
    const run = `${s.run}-${info.project.name}`;
    await signIn(page, s.owner);
    await page.goto(`${org}/constituents/new`);
    await page.getByLabel("First name").fill("Maya");
    await page.getByLabel("Last name").fill(`Phone${run.replace(/[^a-z]/gi, "").slice(0, 8)}`);
    await page.getByRole("textbox", { name: /^Email/ }).fill(`maya-${run}@example.org`);
    await page.getByRole("button", { name: "Add donor" }).click();
    await page.waitForURL(/\/constituents\/[0-9a-f-]{36}$/);
    await checkPage(page, "donor record");

    await page.goto(`${org}/batches`);
    await page.getByRole("button", { name: "New batch" }).click();
    await page.getByLabel("Description").fill(`Phone batch ${run}`);
    await checkPage(page, "new batch form");
    await page.getByRole("button", { name: "Start batch" }).click();
    await page.waitForURL(/\/batches\/[0-9a-f-]{36}/);
    await checkPage(page, "batch gift entry");
  });

  test("make a giving page and give on a phone", async ({ page, browser }, info) => {
    test.setTimeout(180_000);
    const slug = `m-${s.run}-${info.project.name}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    await signIn(page, s.owner);
    await page.goto(`${org}/settings/integrations`);
    if (await page.getByRole("button", { name: "Connect Stripe" }).count()) {
      await page.getByRole("button", { name: "Connect Stripe" }).click();
      await page.getByRole("button", { name: "Connect test account" }).click();
      await page.waitForURL(/settings\/integrations\?connected=stripe/);
    }
    await page.goto(`${org}/settings/giving/new`);
    await page.getByLabel("Title").fill("Phone giving");
    await page.getByLabel("Web address").fill(slug);
    await page.getByRole("button", { name: "Make page" }).click();
    await page.waitForURL(`**${org}/settings/giving`);

    const anon = await browser.newContext({ ...info.project.use });
    const give = await anon.newPage();
    await give.goto(`/give/${slug}`);
    await checkPage(give, "giving form");
    await give.getByText("Other", { exact: true }).click();
    await give.getByLabel("Your amount").fill("15");
    await checkPage(give, "giving form, other amount");
    await give.getByRole("button", { name: /^Give \$/ }).click();
    await expect(give.getByText("Test mode.")).toBeVisible();
    await checkPage(give, "test checkout");
    await anon.close();
  });
});
