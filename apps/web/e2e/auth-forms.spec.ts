import { expect, test } from "@playwright/test";
import { state } from "./helpers";

/**
 * The flaky sign-in found in October 2026: on a slow first load, text typed before the
 * page's scripts started never reached the form's code, and sign-in went out with no
 * email. These recreate that on purpose.
 */
test("text typed before the page's scripts load still signs in", async ({ page }) => {
  const s = state();
  // Hold back the page's scripts until the fields are filled.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/_next/static/chunks/**", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/sign-in", { waitUntil: "commit" });
  await page.getByLabel("Email").waitFor();
  await page.getByLabel("Email").fill(s.owner.email);
  await page.getByLabel("Password").fill(s.owner.password);
  release();
  await page.waitForLoadState("load");
  // Give React a moment to attach to the form that was already filled in.
  await page.waitForFunction(() => Object.keys(document.querySelector("form")!).some((k) => k.startsWith("__react")));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/app/);
});

test("without scripts, pressing Sign in never puts the password in the address", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("someone@test.invalid");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForLoadState("load");
  expect(page.url()).not.toContain("password");
  expect(page.url()).not.toContain("someone");
  await ctx.close();
});

test("an empty email gets a plain message", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Password").fill("anything-at-all");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter your email.")).toBeVisible();
});
