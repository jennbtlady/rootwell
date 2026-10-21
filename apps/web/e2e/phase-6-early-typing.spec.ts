import { expect, test, type Page } from "@playwright/test";
import { signIn, state } from "./helpers";

/**
 * The race behind the flaky sign-in (auth-forms.spec.ts), on the forms people type into
 * first: on a slow first load, text typed before the page's scripts start must still be
 * saved, and a press of the button that early must never put donor details in the address.
 * Runs after the phase 1 tests, which give the organization funds and a Spring appeal.
 */
test.describe.serial("typing before the page's scripts load", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;
  const first = "Early";
  const last = `Typist${s.run}`;
  let batchId = "";
  let donorId = "";

  /** Opens a page with its scripts held back. Fill the fields, then call the result to let them load. */
  async function openHeld(page: Page, url: string) {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route("**/_next/static/chunks/**", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(url, { waitUntil: "commit" });
    return async (formSelector = "main form") => {
      release();
      await page.waitForLoadState("load");
      // Wait until React has attached to the form that was already filled in.
      await page.waitForFunction((sel) => {
        const f = document.querySelector(sel);
        return Boolean(f) && Object.keys(f!).some((k) => k.startsWith("__react"));
      }, formSelector);
      await page.unrouteAll({ behavior: "ignoreErrors" });
    };
  }

  test("a new donor typed before the scripts load is saved with their name", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, s.owner);
    await page.goto(`${org}/batches`);
    await page.getByRole("button", { name: "New batch" }).click();
    await page.getByLabel("Description").fill("Early typing check");
    await page.getByRole("button", { name: "Start batch" }).click();
    await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/);
    batchId = page.url().split("/").pop()!;

    const ready = await openHeld(page, `${org}/constituents/new?batch=${batchId}`);
    await page.getByLabel("First name").fill(first);
    await page.getByLabel("Last name").fill(last);
    await page.getByRole("textbox", { name: /^Email/ }).fill(`early.typist.${s.run}@example.org`);
    await page.getByLabel("City").fill("Springfield");
    await ready();
    await page.getByRole("button", { name: "Add donor" }).click();
    await page.waitForURL(/\/batches\/[0-9a-f-]{36}\?constituent=/);
    await expect(page.getByRole("combobox", { name: /Donor/ })).toHaveValue(`${first} ${last}`);
    donorId = new URL(page.url()).searchParams.get("constituent")!;
  });

  test("a gift typed before the scripts load is saved with its amount", async ({ page }) => {
    test.setTimeout(120_000);
    // Phone width: slow phones are where this happens.
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, s.owner);
    // The batch with the donor already chosen, as the add-donor form leaves it.
    const ready = await openHeld(page, `${org}/batches/${batchId}?constituent=${donorId}`);
    await page.getByLabel(/Amount/).fill("42");
    await page.getByRole("combobox", { name: /Campaign/ }).selectOption({ label: "Spring appeal" });
    await page.getByLabel(/Check number/).fill("7001");
    await page.getByLabel(/Notes/).fill("Typed early");
    await ready("form[aria-labelledby='gift-entry-title']");
    await page.getByRole("button", { name: "Save gift and add another" }).click();
    await expect(page.getByText(`$42.00 from ${first} ${last} saved.`)).toBeVisible();
    await expect(page.getByRole("cell", { name: "$42.00", exact: true })).toBeVisible();
  });

  test("without scripts, pressing Add donor never puts donor details in the address", async ({ page, browser }) => {
    await signIn(page, s.owner);
    const ctx = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() });
    const p = await ctx.newPage();
    await p.goto(`${org}/constituents/new`);
    await p.getByLabel("First name").fill("Nobody");
    await p.getByLabel("Last name").fill("Leaked");
    await p.getByRole("textbox", { name: /^Email/ }).fill("nobody.leaked@example.org");
    await p.getByLabel("Street").fill("12 Hidden Lane");
    const navigated = p.waitForResponse((r) => r.request().isNavigationRequest());
    await p.getByRole("button", { name: "Add donor" }).click();
    const response = await navigated;
    expect(response.request().method()).toBe("POST");
    // A POST to the page just shows the page again.
    expect(response.status()).toBe(200);
    for (const bit of ["Nobody", "Leaked", "nobody", "Hidden", "example.org"]) expect(p.url()).not.toContain(bit);
    await ctx.close();
  });
});
