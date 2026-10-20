import { sql } from "drizzle-orm";
import type { Claims } from "@maple/core";
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
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
