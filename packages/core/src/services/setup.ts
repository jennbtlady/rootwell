import { sql } from "drizzle-orm";
import type { Tx } from "./types";

/**
 * The setup steps from the brief, each worked out from the data so it ticks itself off.
 * The guided walkthrough (a future build) will use the same list.
 */
export type SetupStep = { key: "funds" | "standards" | "import" | "team" | "thanks" | "online"; done: boolean; optional: boolean };

export async function setupProgress(tx: Tx, orgId: string): Promise<SetupStep[] | null> {
  const r = await tx.execute(sql`
    select
      exists (select 1 from funds where org_id = o.id) as funds,
      o.gift_entry_standards <> '{}'::jsonb as standards,
      exists (select 1 from constituents where org_id = o.id) as import,
      (select count(*) from org_memberships where org_id = o.id) > 1 as team,
      exists (select 1 from acknowledgment_templates where org_id = o.id) as thanks,
      exists (select 1 from integrations where org_id = o.id and provider = 'stripe' and status = 'connected') as online
    from organizations o where o.id = ${orgId}`);
  if (!r.length) return null;
  const x = r[0] as Record<SetupStep["key"], boolean>;
  return (["funds", "standards", "import", "team", "thanks", "online"] as const).map((key) => ({ key, done: Boolean(x[key]), optional: key === "online" }));
}
