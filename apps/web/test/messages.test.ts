import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "../src/components/auth/messages";

describe("friendlyAuthError", () => {
  it("maps known Supabase errors to plain sentences", () => {
    expect(friendlyAuthError("Invalid login credentials")).toBe("That email and password do not match.");
    expect(friendlyAuthError("User already registered")).toMatch(/already exists/);
  });
  it("never echoes an unknown message", () => {
    const raw = "duplicate key value violates unique constraint pat@example.org";
    expect(friendlyAuthError(raw)).not.toContain("pat@example.org");
    expect(friendlyAuthError(undefined)).toBe("Something went wrong. Please try again.");
  });
});
