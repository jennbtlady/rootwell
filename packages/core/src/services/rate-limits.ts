import { sql } from "drizzle-orm";
import type { Tx } from "./types";

/** The limits in one place, so they can be tuned without hunting. Windows are in seconds. */
export const RATE_LIMITS = {
  /** One visitor starting checkouts on giving pages. Stops card testing from one address. */
  checkoutVisitor: { limit: 10, windowSeconds: 600 },
  /** All visitors on one giving page. Stops a spread-out card-testing burst. */
  checkoutPage: { limit: 100, windowSeconds: 600 },
  /** One visitor opening board links. Stops guessing link tokens. */
  boardVisitor: { limit: 60, windowSeconds: 60 },
  /** One organization sending thank-you or statement emails in bulk. */
  bulkEmailOrg: { limit: 10, windowSeconds: 3600 },
  /** One visitor opening a monthly donor's "manage" link. Stops guessing at links. */
  manageVisitor: { limit: 20, windowSeconds: 600 },
  /** How often a giving page may warn its organization about a burst of checkouts: once in six hours. */
  spikeAlertPage: { limit: 1, windowSeconds: 6 * 3600 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Counts one request against a limit and says whether it may go ahead. `key` says who is
 * counted: a hashed visitor, a giving page, or an organization. Never pass a raw IP address.
 */
export async function hitRateLimit(tx: Tx, name: RateLimitName, key: string): Promise<boolean> {
  const { limit, windowSeconds } = RATE_LIMITS[name];
  const rows = await tx.execute(sql`select app.hit_rate_limit(${`${name}:${key}`}, ${limit}, ${windowSeconds}) as ok`);
  return (rows[0] as { ok: boolean }).ok;
}
