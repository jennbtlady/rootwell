import { describe, expect, it } from "vitest";
import { cn } from "../src/lib/cn";

describe("cn with the Paste theme", () => {
  it("keeps a text color next to a Paste font size", () => {
    expect(cn("text-30 text-text-inverse")).toBe("text-30 text-text-inverse");
    expect(cn("text-text-inverse text-30")).toBe("text-text-inverse text-30");
  });
  it("still resolves real conflicts, later wins", () => {
    expect(cn("text-text text-text-weak")).toBe("text-text-weak");
    expect(cn("text-30 text-40")).toBe("text-40");
    expect(cn("rounded-20 rounded-30")).toBe("rounded-30");
    expect(cn("shadow-border-weak shadow-focus")).toBe("shadow-focus");
    expect(cn("bg-background-primary bg-background-weakest")).toBe("bg-background-weakest");
  });
});
