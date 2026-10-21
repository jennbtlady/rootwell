import { expect, test } from "@playwright/test";
import { expectAccessible, signIn, state } from "./helpers";

/**
 * Phase 6 accessibility audit (WCAG 2.1 AA). Part one scans every page an owner can reach,
 * including one of each detail page. Part two checks keyboard use: skip link, main
 * navigation, dialogs, and filling a form without a mouse. Findings: docs/accessibility-audit.md.
 */
test.describe.serial("accessibility audit", () => {
  const s = state();
  const org = `/app/orgs/${s.orgId}`;

  test("every page passes the WCAG 2.1 AA scan", async ({ page }) => {
    test.setTimeout(600_000);
    await signIn(page, s.owner);
    const pages = [
      "/app",
      "/app/help",
      "/app/help/getting-started",
      org,
      `${org}/setup`,
      `${org}/constituents`,
      `${org}/constituents/new`,
      `${org}/duplicates`,
      `${org}/merges`,
      `${org}/health`,
      `${org}/imports`,
      `${org}/batches`,
      `${org}/gifts`,
      `${org}/acknowledgments`,
      `${org}/acknowledgments/templates`,
      `${org}/acknowledgments/statements`,
      `${org}/dashboard`,
      `${org}/reports`,
      `${org}/settings`,
      `${org}/settings/team`,
      `${org}/settings/account`,
      `${org}/settings/billing`,
      `${org}/settings/coding`,
      `${org}/settings/gift-standards`,
      `${org}/settings/giving`,
      `${org}/settings/giving/new`,
      `${org}/settings/integrations`,
      `${org}/settings/board`,
    ];
    for (const p of pages) {
      await page.goto(p);
      await expectAccessible(page, p.replace(org, "org"));
    }
    // One of each detail page, reached the way a person would.
    for (const [list, linkInTable] of [
      [`${org}/constituents`, "Donors"],
      [`${org}/batches`, null],
      [`${org}/reports`, null],
    ] as const) {
      await page.goto(list);
      const link = linkInTable ? page.getByRole("region", { name: linkInTable }).getByRole("link").first() : page.locator("main a[href*='/batches/'], main a[href*='/reports/']").first();
      if (await link.count()) {
        await link.click();
        await page.waitForLoadState("networkidle");
        await expectAccessible(page, `detail from ${list.replace(org, "org")}`);
      }
    }
  });

  test("the skip link jumps past the navigation", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/constituents`);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("the main navigation works from the keyboard", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(org);
    const gifts = page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).getByRole("link", { name: "Gifts" });
    await gifts.focus();
    await expect(gifts).toBeFocused();
    await page.keyboard.press("Enter");
    await page.waitForURL(`**${org}/batches`);
    await expect(page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).getByRole("link", { name: "Gifts" })).toHaveAttribute("aria-current", "page");
  });

  test("a dialog opens, traps focus, and closes with Escape, returning focus", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/batches`);
    const open = page.getByRole("button", { name: "New batch" });
    await open.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      // Base UI sends focus through an invisible guard at each end of the dialog, which
      // then moves it back inside. Wait for focus to settle before checking.
      await expect
        .poll(() => dialog.evaluate((d) => (d.contains(document.activeElement) ? "inside" : `outside: ${document.activeElement?.outerHTML.slice(0, 120)}`)), { timeout: 2000 })
        .toBe("inside");
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
  });

  test("a donor can be added with the keyboard alone", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/constituents/new`);
    await page.getByLabel("First name").focus();
    await page.keyboard.type("Keyboard");
    await page.keyboard.press("Tab");
    // Tab order follows the screen: middle name or last name comes next.
    const next = await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.labels?.[0]?.textContent ?? "");
    expect(next).toMatch(/Middle|Last/);
    await page.getByLabel("Last name").focus();
    await page.keyboard.type(`Only${s.run.replace(/\d/g, "").slice(0, 4)}`);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/constituents\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Keyboard");
  });

  test("focus is always visible", async ({ page }) => {
    await signIn(page, s.owner);
    await page.goto(`${org}/settings/integrations`);
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      // The ring may sit on the control or, for text fields, on the box around it.
      const missing = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const ringed = (n: Element) => {
          const cs = getComputedStyle(n);
          return cs.boxShadow !== "none" || (cs.outlineStyle !== "none" && cs.outlineWidth !== "0px");
        };
        let n: Element | null = el;
        for (let depth = 0; n && depth < 3; depth++, n = n.parentElement) if (ringed(n)) return null;
        return el.outerHTML.slice(0, 200);
      });
      expect(missing, `tab stop ${i + 1} has no visible focus`).toBeNull();
    }
  });

  test("pages reflow at 320px wide, the same as 400% zoom (WCAG 1.4.10)", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 320, height: 640 });
    await signIn(page, s.owner);
    for (const p of [org, `${org}/constituents`, `${org}/batches`, `${org}/acknowledgments`, `${org}/dashboard`, `${org}/settings`, `${org}/settings/integrations`, "/app/help/billing"]) {
      await page.goto(p);
      const over = await page.evaluate(() => {
        const w = window.innerWidth;
        const wide = [...document.querySelectorAll("main *")]
          .filter((e) => e.getBoundingClientRect().right > w + 1 && !e.closest("[role=region]"))
          .slice(0, 3)
          .map((e) => `${e.tagName}.${String((e as HTMLElement).className).slice(0, 60)} "${(e.textContent ?? "").slice(0, 30)}"`);
        return { by: document.documentElement.scrollWidth - w, wide };
      });
      expect(over.by, `${p.replace(org, "org")} scrolls sideways at 320px: ${over.wide.join(" ; ")}`).toBeLessThanOrEqual(1);
    }
  });
});
