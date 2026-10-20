import { describe, expect, it } from "vitest";
import { can, createOrganizationInput, einSchema, inviteMemberInput } from "../src";

describe("createOrganizationInput", () => {
  it("applies defaults and trims", () => {
    const r = createOrganizationInput.parse({ name: "  Riverside Food Pantry " });
    expect(r).toEqual({ name: "Riverside Food Pantry", fiscalYearStartMonth: 1, timezone: "America/New_York" });
  });
  it("rejects a one character name", () => {
    expect(createOrganizationInput.safeParse({ name: "A" }).success).toBe(false);
  });
});

describe("einSchema", () => {
  it("normalizes to the dashed form", () => {
    expect(einSchema.parse("123456789")).toBe("12-3456789");
    expect(einSchema.parse("12-3456789")).toBe("12-3456789");
  });
  it("rejects wrong lengths", () => {
    expect(einSchema.safeParse("1234").success).toBe(false);
  });
});

describe("inviteMemberInput", () => {
  it("lowercases email and refuses the owner role", () => {
    expect(inviteMemberInput.parse({ email: "Pat@Example.org", role: "staff" }).email).toBe("pat@example.org");
    expect(inviteMemberInput.safeParse({ email: "a@b.co", role: "owner" }).success).toBe(false);
  });
});

describe("role matrix", () => {
  it("keeps board viewers away from PII and staff away from posting", () => {
    expect(can("board_viewer", "readConstituents")).toBe(false);
    expect(can("board_viewer", "viewDashboard")).toBe(true);
    expect(can("staff", "postBatch")).toBe(false);
    expect(can("admin", "exportAll")).toBe(false);
    expect(can("owner", "exportAll")).toBe(true);
  });
});
