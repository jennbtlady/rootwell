import { describe, expect, it } from "vitest";
import { brandingInput, brandingWarnings, contrastRatio, resolvedBranding, textOn } from "../src/branding";
import { BUNDLES, expandModules } from "../src/modules";

describe("modules and bundles", () => {
  it("expands bundles to modules in one place", () => {
    expect(expandModules(["core"])).toEqual(["donations"]);
    expect(expandModules(["fundraising"]).sort()).toEqual(["events", "peer_fundraising"]);
    expect(expandModules(["core", "events"]).sort()).toEqual(["donations", "events"]);
    expect(Object.keys(BUNDLES)).toEqual(["core", "fundraising", "auction"]);
  });

  it("refuses a name that is neither a bundle nor a module", () => {
    expect(() => expandModules(["everything"])).toThrow("Unknown bundle or module: everything");
  });
});

describe("branding contrast", () => {
  it("matches known WCAG ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 1);
  });

  it("picks the button text that reads best", () => {
    expect(textOn("#1A3D8F")).toBe("#FFFFFF");
    expect(textOn("#FFD43B")).toBe("#121C2D");
  });

  it("warns about a light primary color and a faint accent, and not about good ones", () => {
    expect(brandingWarnings({ primaryColor: "#1A3D8F", accentColor: "#2E7D32" })).toEqual([]);
    const w = brandingWarnings({ primaryColor: "#FFD43B", accentColor: "#FFF3B0" });
    expect(w.map((x) => x.field)).toEqual(["primaryColor", "accentColor"]);
    expect(w[0]!.message).toContain("hard to read on a white page");
  });

  it("falls back to Rootwell's colors, and checks the color format", () => {
    expect(resolvedBranding({}).primary).toBe("#500030");
    expect(brandingInput.parse({ primaryColor: "#1a3d8f", accentColor: null })).toEqual({ primaryColor: "#1A3D8F", accentColor: null, logoPath: null, headerImagePath: null });
    const org = "0b7c2f6e-4c1a-4d0e-9a51-5b8f3c2d1e00";
    expect(brandingInput.safeParse({ primaryColor: null, accentColor: null, logoPath: `${org}/logo-ab12.png` }).success).toBe(true);
    expect(brandingInput.safeParse({ primaryColor: null, accentColor: null, logoPath: `${org}/../x.png` }).success).toBe(false);
    expect(brandingInput.safeParse({ primaryColor: null, accentColor: null, logoPath: `${org}/logo.svg` }).success).toBe(false);
    expect(brandingInput.safeParse({ primaryColor: "blue", accentColor: null }).success).toBe(false);
  });
});
