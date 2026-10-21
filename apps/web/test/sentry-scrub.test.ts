import { describe, expect, it } from "vitest";
import { scrubEvent, scrubText } from "../src/lib/sentry-scrub";

describe("Sentry scrubber", () => {
  it("blanks emails, phone numbers, card-like numbers and street addresses in text", () => {
    expect(scrubText("Failed for dana.rivera@example.org at (217) 555-1592")).toBe("Failed for [email] at [phone]");
    expect(scrubText("card 4242 4242 4242 4242 and 12 Elm Street")).toBe("card [number] and [address]");
    expect(scrubText("constituent 6b1f0c2e-1a2b-4c3d-8e9f-001122334455 not found")).toBe("constituent 6b1f0c2e-1a2b-4c3d-8e9f-001122334455 not found");
  });

  it("drops bodies, cookies, auth headers, queries, user details and console breadcrumbs", () => {
    const out = scrubEvent({
      message: "Import failed for ruth@example.org",
      user: { id: "u1", email: "ruth@example.org", ip_address: "1.2.3.4", username: "Ruth" },
      request: {
        url: "https://app.example/api/v1/orgs/o1/constituents?q=Ruth%20Goldberg",
        data: '{"firstName":"Ruth"}',
        cookies: { sb: "secret" },
        query_string: "q=Ruth",
        headers: { authorization: "Bearer eyJ...", cookie: "sb=...", "user-agent": "Safari" },
      },
      extra: { row: { email: "x@example.org" } },
      contexts: { os: { name: "iOS" }, donor: { name: "Ruth" } },
      exception: { values: [{ type: "Error", value: "duplicate key for tom@example.org" }] },
      breadcrumbs: [
        { category: "console", message: "Ruth Goldberg saved" },
        { category: "fetch", data: { url: "/api/v1/orgs/o1/constituents?q=Ruth", method: "GET" } },
        { category: "navigation", data: { from: "/give/x?email=a@b.org", to: "/give/x/thanks?session=cs_1" } },
      ],
    });
    expect(out.message).toBe("Import failed for [email]");
    expect(out.user).toEqual({ id: "u1" });
    expect(out.request).toEqual({ url: "https://app.example/api/v1/orgs/o1/constituents", headers: { "user-agent": "Safari" } });
    expect(out).not.toHaveProperty("extra");
    expect(out.contexts).toEqual({ os: { name: "iOS" } });
    expect(out.exception).toEqual({ values: [{ type: "Error", value: "duplicate key for [email]" }] });
    expect(out.breadcrumbs).toEqual([
      { category: "fetch", message: undefined, data: { url: "/api/v1/orgs/o1/constituents", method: "GET", to: undefined, from: undefined } },
      { category: "navigation", message: undefined, data: { url: undefined, from: "/give/x", to: "/give/x/thanks" } },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/Ruth|Goldberg|@example|eyJ|secret/);
  });
});
