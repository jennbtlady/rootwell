import { expect, test } from "@playwright/test";

/**
 * No page may be shown inside another site's frame (clickjacking), except the public giving
 * pages, which nonprofits embed on their own websites (fundraising Phase 1, Jenn 2026-11-11).
 * Checks signed-out pages, a signed-in path, the board link, the API, and the giving pages.
 */
test.describe("security headers", () => {
  for (const path of ["/", "/sign-in", "/app", "/board/not-a-real-token-1234567890", "/api/v1/health", "/given", "/embed.js"]) {
    test(`${path} refuses to be framed`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(res.headers()["x-frame-options"]).toBe("DENY");
    });
  }

  test("giving pages may be framed, for the embed, and nothing else changes", async ({ request }) => {
    for (const path of ["/give/no-such-page", "/give/no-such-page?embed=1", "/give/no-such-page/thanks"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.headers()["content-security-policy"], path).toBe("frame-ancestors *");
      expect(res.headers()["x-frame-options"], path).toBeUndefined();
    }
  });

  test("every page sends the launch review's security headers", async ({ request }) => {
    for (const path of ["/", "/sign-in", "/give/no-such-page", "/api/v1/health"]) {
      const h = (await request.get(path, { maxRedirects: 0 })).headers();
      expect(h["x-content-type-options"], path).toBe("nosniff");
      expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      expect(h["permissions-policy"], path).toContain("camera=()");
      expect(h["strict-transport-security"], path).toContain("max-age=");
    }
  });

  test("a page framed by another site does not render", async ({ page, baseURL }) => {
    let blocked = false;
    page.on("console", (m) => {
      if (/frame-ancestors|Refused to (display|frame)/i.test(m.text())) blocked = true;
    });
    await page.setContent(`<iframe id="f" src="${baseURL}/sign-in" title="test"></iframe>`);
    await page.waitForTimeout(3000);
    const framed = page.frames().find((f) => f.url().includes("/sign-in"));
    const rendered = framed ? await framed.locator("body").innerText().catch(() => "") : "";
    expect(blocked || !rendered.includes("Sign in")).toBe(true);
  });

  test("icons load signed out, while private pages still require sign-in", async ({ request }) => {
    for (const path of ["/apple-icon.png", "/icon.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/manifest.webmanifest"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(200);
    }
    for (const path of ["/app", "/app/orgs/new", "/account", "/mfa/enroll"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(res.headers().location, path).toContain("/sign-in");
    }
  });
});
