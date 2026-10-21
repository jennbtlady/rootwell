import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { E2EState } from "./global-setup";

export function state(): E2EState {
  return JSON.parse(readFileSync("e2e/.state/state.json", "utf8")) as E2EState;
}

export async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/app/);
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
