import { expect, test } from "@playwright/test";

/**
 * No page may be shown inside another site's frame (clickjacking). Checks signed-out
 * pages, a signed-in path, the public giving page, and the API.
 */
test.describe("security headers", () => {
  for (const path of ["/", "/sign-in", "/app", "/give/no-such-page", "/board/not-a-real-token-1234567890", "/api/v1/health"]) {
    test(`${path} refuses to be framed`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(res.headers()["x-frame-options"]).toBe("DENY");
    });
  }

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
