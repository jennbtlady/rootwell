import type { CSSProperties } from "react";
import { resolvedBranding, type OrgBranding } from "@maple/core";

/**
 * A nonprofit's brand on its public pages (fundraising Phase 1). Admin screens keep the
 * Rootwell palette from packages/design/overrides.css. A public page wraps itself in these
 * styles, which redefine the primary tokens for that subtree only, so every Button, link and
 * focus ring inside follows the organization's colors.
 *
 * This is the one place outside overrides.css that sets design tokens, because the values come
 * from each organization at runtime (docs/design-system.md, "Public pages").
 */
export function brandStyle(b: OrgBranding): CSSProperties {
  const { primary, accent, onPrimary } = resolvedBranding(b);
  const shade = (pct: number) => `color-mix(in srgb, ${primary} ${pct}%, black)`;
  const tint = (pct: number) => `color-mix(in srgb, ${primary} ${pct}%, white)`;
  return {
    "--paste-color-background-primary": primary,
    "--paste-color-background-primary-strong": shade(80),
    "--paste-color-background-primary-stronger": shade(65),
    "--paste-color-background-primary-strongest": shade(50),
    "--paste-color-background-primary-weak": tint(45),
    "--paste-color-background-primary-weaker": tint(25),
    "--paste-color-background-primary-weakest": tint(10),
    "--paste-color-text-primary": primary,
    "--paste-color-text-primary-strong": shade(80),
    "--paste-color-text-primary-stronger": shade(65),
    "--paste-color-text-primary-strongest": shade(50),
    "--paste-color-text-link": primary,
    "--paste-color-text-link-strong": shade(80),
    "--paste-color-text-link-stronger": shade(65),
    "--paste-color-text-link-strongest": shade(50),
    "--paste-color-border-primary": primary,
    "--paste-color-border-primary-strong": shade(80),
    "--paste-color-border-primary-stronger": shade(65),
    "--paste-color-border-primary-weak": tint(45),
    "--paste-color-border-primary-weaker": tint(25),
    "--paste-color-border-primary-weakest": tint(10),
    "--paste-shadow-border-primary": `0 0 0 1px ${primary}`,
    "--paste-shadow-border-primary-strong": `0 0 0 1px ${shade(80)}`,
    "--paste-shadow-border-primary-weaker": `0 0 0 1px ${tint(25)}`,
    "--paste-shadow-focus": `0 0 0 4px color-mix(in srgb, ${primary} 70%, transparent)`,
    "--paste-shadow-focus-inset": `inset 0 0 0 2px color-mix(in srgb, ${primary} 70%, transparent)`,
    // Text on a primary button: white or near-black, whichever reads better on the brand color.
    "--paste-color-text-inverse": onPrimary,
    // Progress bars and other marks (fundraiser pages, later).
    "--brand-accent": accent,
  } as CSSProperties;
}

/** Public address of an image in the branding bucket. */
export function brandingImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return base ? `${base}/storage/v1/object/public/branding/${path}` : null;
}
