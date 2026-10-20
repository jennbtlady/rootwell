import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";
import type { E2EState } from "./global-setup";

/** Removes the run's organization and people so a local database does not fill up. */
export default async function globalTeardown() {
  if (!existsSync("e2e/.state/state.json") || !process.env.DATABASE_URL) return;
  const s = JSON.parse(readFileSync("e2e/.state/state.json", "utf8")) as E2EState;
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  await sql`delete from organizations where id = ${s.orgId}`;
  await sql`delete from auth.users where id in (${s.owner.id}, ${s.staff.id})`;
  await sql.end();
}
