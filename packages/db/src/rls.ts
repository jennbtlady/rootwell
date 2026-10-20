import { sql } from "drizzle-orm";
import type { Claims } from "./claims";
import type { Db } from "./client";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type RlsTx = Tx;

/**
 * Runs `fn` inside a transaction that Postgres sees as the given identity.
 *
 * - `request.jwt.claims` is what Supabase sets for PostgREST requests, so the same
 *   RLS policies apply whether a query arrives through this helper or through supabase-js.
 * - `set local role authenticated` drops superuser privileges for the rest of the
 *   transaction, which is what makes RLS apply at all.
 *
 * Both settings are `local`, so they end with the transaction and never leak to the
 * next request on a pooled connection.
 */
export async function withRls<T>(db: Db, claims: Claims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
    if (mfaEnforcementOff()) await tx.execute(sql`select set_config('app.mfa_enforcement', 'off', true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}

/**
 * Local development only: MFA_ENFORCEMENT=off lets owners and admins work without a
 * second step while testing. Ignored when NODE_ENV is production, so a stray variable
 * on a server cannot turn MFA off.
 */
export function mfaEnforcementOff(): boolean {
  return process.env.MFA_ENFORCEMENT === "off" && process.env.NODE_ENV !== "production";
}

/**
 * For the few public pages (the board share link). Runs as Postgres's `anon` role with no
 * user claims, so only functions granted to anon work and RLS hides every table.
 */
export async function withPublic<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await tx.execute(sql`set local role anon`);
    return fn(tx);
  });
}
