import { sql } from "drizzle-orm";
import type { Tx } from "./types";

/**
 * The setup steps, each worked out from the data so it ticks itself off only after a person
 * made the decision (never because a page was opened). The guided walkthrough on Home and at
 * /setup uses this list.
 *
 * - profile: the mailing address is saved (it goes on every letter). The EIN is asked for but
 *   optional, since a new or fiscally sponsored group may not have one yet.
 * - funds: at least one fund exists.
 * - rules: the gift rules were saved at least once.
 * - donors: at least one donor exists.
 * - team: someone besides the owner was invited.
 * - thanks: someone saved the thank-you letter (the defaults are created untouched).
 * - online: Stripe is connected. Optional.
 */
export type SetupKey = "profile" | "funds" | "rules" | "donors" | "team" | "thanks" | "online";
export type SetupStep = { key: SetupKey; done: boolean; optional: boolean; required: boolean };

/** The steps a new organization must finish before Home switches from the setup guide to the dashboard. */
export const REQUIRED_SETUP: SetupKey[] = ["profile", "funds", "rules"];

export async function setupProgress(tx: Tx, orgId: string): Promise<SetupStep[] | null> {
  const r = await tx.execute(sql`
    select
      coalesce(o.address->>'line1', '') <> '' as profile,
      exists (select 1 from funds where org_id = o.id) as funds,
      o.gift_entry_standards <> '{}'::jsonb as rules,
      exists (select 1 from constituents where org_id = o.id) as donors,
      (select count(*) from org_memberships where org_id = o.id and status in ('active', 'invited')) > 1 as team,
      exists (select 1 from acknowledgment_templates where org_id = o.id and updated_at > created_at + interval '1 second') as thanks,
      exists (select 1 from integrations where org_id = o.id and provider = 'stripe' and status = 'connected') as online
    from organizations o where o.id = ${orgId}`);
  if (!r.length) return null;
  const x = r[0] as Record<SetupKey, boolean>;
  const order: SetupKey[] = ["profile", "funds", "rules", "donors", "team", "thanks", "online"];
  return order.map((key) => ({ key, done: Boolean(x[key]), optional: key === "team" || key === "online", required: REQUIRED_SETUP.includes(key) }));
}

/**
 * Home shows the setup guide instead of the dashboard while the required steps are not done
 * and no gift has been recorded. An organization that already has gifts (for example from an
 * import) always sees its dashboard, with a smaller "finish setup" card.
 */
export async function inSetupMode(tx: Tx, orgId: string, steps: SetupStep[]): Promise<boolean> {
  if (steps.filter((s) => s.required).every((s) => s.done)) return false;
  const g = await tx.execute(sql`select exists (select 1 from gifts where org_id = ${orgId}) as any`);
  return !(g[0] as { any: boolean }).any;
}
