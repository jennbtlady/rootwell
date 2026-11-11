import { z } from "zod";

/**
 * Branding for public pages (fundraising Phase 1): giving pages and, later, fundraiser and event
 * pages carry the nonprofit's brand. Admin screens keep the Rootwell brand.
 */
export type OrgBranding = { primaryColor?: string; accentColor?: string; headerImagePath?: string };

/** Rootwell's own colors, used on public pages until an organization picks its own. */
export const DEFAULT_BRANDING = { primaryColor: "#0263E0", accentColor: "#14B053" } as const;

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a color like #1A6B3C: a # and six letters or numbers.")
  .transform((v) => v.toUpperCase());

export const brandingInput = z.object({
  primaryColor: hex.nullable(),
  accentColor: hex.nullable(),
});
export type BrandingInput = z.infer<typeof brandingInput>;

/** WCAG 2.1 relative luminance of a #RRGGBB color. */
export function luminance(color: string): number {
  const n = Number.parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two #RRGGBB colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black text, whichever reads better on the color. */
export function textOn(color: string): "#FFFFFF" | "#121C2D" {
  return contrastRatio(color, "#FFFFFF") >= contrastRatio(color, "#121C2D") ? "#FFFFFF" : "#121C2D";
}

export type BrandingWarning = { field: "primaryColor" | "accentColor"; message: string };

/**
 * Plain-language warnings when brand colors fail WCAG 2.1 AA on a public page. The page still
 * works: buttons pick white or dark text automatically. These warn about what cannot be fixed
 * that way. Text needs 4.5:1; the accent marks progress bars and outlines, which need 3:1.
 */
export function brandingWarnings(b: OrgBranding): BrandingWarning[] {
  const out: BrandingWarning[] = [];
  const white = "#FFFFFF";
  if (b.primaryColor) {
    const onWhite = contrastRatio(b.primaryColor, white);
    const button = contrastRatio(b.primaryColor, textOn(b.primaryColor));
    if (onWhite < 4.5) out.push({ field: "primaryColor", message: `Links in this color are hard to read on a white page (contrast ${onWhite.toFixed(1)} to 1; it needs 4.5). Try a darker shade.` });
    if (button < 4.5) out.push({ field: "primaryColor", message: `Button text is hard to read on this color (contrast ${button.toFixed(1)} to 1; it needs 4.5). Try a darker or lighter shade.` });
  }
  if (b.accentColor) {
    const onWhite = contrastRatio(b.accentColor, white);
    if (onWhite < 3) out.push({ field: "accentColor", message: `Progress bars in this color are hard to see on a white page (contrast ${onWhite.toFixed(1)} to 1; it needs 3). Try a darker shade.` });
  }
  return out;
}

/** The colors a public page uses: the organization's, or Rootwell's where none is set. */
export function resolvedBranding(b: OrgBranding) {
  const primary = b.primaryColor ?? DEFAULT_BRANDING.primaryColor;
  const accent = b.accentColor ?? DEFAULT_BRANDING.accentColor;
  return { primary, accent, onPrimary: textOn(primary) };
}
