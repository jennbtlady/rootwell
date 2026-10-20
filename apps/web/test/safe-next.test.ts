import { describe, expect, it } from "vitest";
import { safeNextPath } from "../src/lib/session";

describe("safeNextPath", () => {
  it("keeps in-app paths", () => {
    expect(safeNextPath("/app/orgs/new")).toBe("/app/orgs/new");
  });
  it("falls back for missing or empty values", () => {
    expect(safeNextPath(null)).toBe("/app");
    expect(safeNextPath("")).toBe("/app");
    expect(safeNextPath(undefined, "/")).toBe("/");
  });
  it("refuses anything that could leave the site", () => {
    expect(safeNextPath("https://evil.example")).toBe("/app");
    expect(safeNextPath("//evil.example")).toBe("/app");
    expect(safeNextPath("/\\evil.example")).toBe("/app");
    expect(safeNextPath("javascript:alert(1)")).toBe("/app");
  });
});
