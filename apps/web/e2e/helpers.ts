import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { E2EState } from "./global-setup";

export function state(): E2EState {
  return JSON.parse(readFileSync("e2e/.state/state.json", "utf8")) as E2EState;
}

/**
 * Signs in through the form. If it does not reach /app, the failure lists what the auth
 * server answered, so a flaky sign-in says why (for example "missing email or phone").
 * Auth replies here carry no passwords.
 */
export async function signIn(page: Page, who: { email: string; password: string }) {
  const log: string[] = [];
  const onResp = async (r: import("@playwright/test").Response) => {
    if (r.url().includes("/auth/v1/")) log.push(`auth ${r.status()} ${r.url().replace(/\?.*/, "")} ${r.status() >= 400 ? (await r.text().catch(() => "")).slice(0, 300) : ""}`);
  };
  const onFail = (r: import("@playwright/test").Request) => log.push(`failed ${r.url().replace(/\?.*/, "")}: ${r.failure()?.errorText}`);
  const onConsole = (m: import("@playwright/test").ConsoleMessage) => { if (m.type() === "error") log.push(`console: ${m.text().slice(0, 300)}`); };
  page.on("response", onResp);
  page.on("requestfailed", onFail);
  page.on("console", onConsole);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  try {
    await page.waitForURL(/\/app/, { timeout: 30_000 });
  } catch (e) {
    console.log(`Sign-in did not finish:\n  ${log.join("\n  ") || "no auth requests were made"}`);
    throw e;
  } finally {
    page.off("response", onResp);
    page.off("requestfailed", onFail);
    page.off("console", onConsole);
  }
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/sign-in/);
}

/** WCAG 2.1 AA scan. Fails the test on any violation, with the rule and the first node. */
export async function expectAccessible(page: Page, label: string) {
  // Let color transitions (100 to 200 ms) finish so the scan measures settled colors.
  await page.waitForTimeout(400);
  // Base UI adds invisible focus-guard spans around open dialogs to keep keyboard focus
  // inside. In Safari they carry role="button" with no name, which axe flags. They are
  // never visible or reachable as content, so they are left out of the scan.
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("[data-base-ui-focus-guard]").analyze();
  const summary = results.violations.map((v) => {
    const n = v.nodes[0];
    const detail = n?.any[0]?.data ? JSON.stringify(n.any[0].data) : "";
    return `${v.id}: ${v.help}\n    ${n?.html.slice(0, 600)}\n    ${detail}`;
  });
  expect(summary, `${label} has accessibility violations`).toEqual([]);
}

/** Chooses a button in the app's own confirm dialog (it replaced the browser's confirm box). */
export async function confirmIn(page: Page, button: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
