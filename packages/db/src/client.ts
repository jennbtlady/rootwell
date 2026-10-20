import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

/**
 * Creates the one database handle for a process. Keep it private to the module that
 * owns the request lifecycle; everything else receives a transaction from withRls().
 */
export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, {
    // Supabase's pooler runs in transaction mode. Prepared statements do not survive it.
    prepare: false,
    max: 10,
  });
  return drizzle(client, { schema, casing: "snake_case" });
}
