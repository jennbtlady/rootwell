/**
 * Modules and bundles (fundraising Phase 1). An organization has a set of modules. Bundles are
 * what Noble Maple sells; each maps to modules here and only here, so pricing can change
 * without touching feature code. Feature code asks about modules, never about bundles.
 */
export const MODULES = ["donations", "peer_fundraising", "events", "auction"] as const;
export type ModuleKey = (typeof MODULES)[number];

/** Plain-language names for screens and the admin script. */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  donations: "Donations: giving pages, monthly gifts, receipts",
  peer_fundraising: "People raising money for you: campaigns, fundraiser pages, teams",
  events: "Events: tickets, registration, guest list, check-in",
  auction: "Auction (not built yet)",
};

export const BUNDLES = {
  /** Every organization has Core. New organizations get it automatically. */
  core: ["donations"],
  fundraising: ["peer_fundraising", "events"],
  auction: ["auction"],
} as const satisfies Record<string, readonly ModuleKey[]>;
export type BundleKey = keyof typeof BUNDLES;

export function isModuleKey(v: string): v is ModuleKey {
  return (MODULES as readonly string[]).includes(v);
}

/** Expands bundle and module names (as typed into the admin script) to modules. */
export function expandModules(names: string[]): ModuleKey[] {
  const out = new Set<ModuleKey>();
  for (const n of names) {
    if (n in BUNDLES) for (const m of BUNDLES[n as BundleKey]) out.add(m);
    else if (isModuleKey(n)) out.add(n);
    else throw new Error(`Unknown bundle or module: ${n}. Bundles: ${Object.keys(BUNDLES).join(", ")}. Modules: ${MODULES.join(", ")}.`);
  }
  return [...out];
}
