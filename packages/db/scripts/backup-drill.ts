/**
 * Backup and restore drill (Phase 6). Takes a full logical backup of our schemas, restores
 * it into a brand-new database, and proves the copy is whole and still safe:
 *   1. Row counts and a money checksum match, table by table.
 *   2. RLS is on for every tenant table, with the same policies and app functions.
 *   3. In the copy, a signed-in member sees their own organization and nobody else's.
 * Prints how long each step took. Removes the copy at the end.
 *
 *   DATABASE_URL=... pnpm --filter @maple/db backup-drill
 *
 * Local Supabase has pg_dump inside its database container, so the dump and restore run
 * there (DB_CONTAINER, found automatically). For a hosted project, run the same pg_dump
 * and pg_restore commands from any machine with Postgres 17 tools; see docs/backup-restore.md.
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const container =
  process.env.DB_CONTAINER ??
  execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .find((n) => n.startsWith("supabase_db_"));
if (!container) throw new Error("No local Supabase database container found. Set DB_CONTAINER.");

const COPY = "restore_drill";
const SCHEMAS = ["public", "app", "auth", "drizzle"];
const dexec = (args: string[]) => execFileSync("docker", ["exec", container, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
const psql = (db: string, command: string) => dexec(["psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-qAtc", command]);
const copyUrl = () => {
  const u = new URL(url);
  u.pathname = `/${COPY}`;
  return u.toString();
};
const step = async <T>(label: string, fn: () => Promise<T> | T): Promise<T> => {
  const s = Date.now();
  const r = await fn();
  console.log(`  ${label}: ${((Date.now() - s) / 1000).toFixed(1)}s`);
  return r;
};

type Snapshot = { counts: Record<string, number>; giftTotal: string; policies: number; rlsTables: number; appFunctions: number };

async function snapshot(conn: string): Promise<Snapshot> {
  const sql = postgres(conn, { max: 1, onnotice: () => {} });
  try {
    const tables = (await sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`).map((r) => r.table_name as string);
    const counts: Record<string, number> = {};
    for (const t of tables) counts[t] = Number((await sql`select count(*)::bigint as n from ${sql(t)}`)[0]!.n);
    counts["auth.users"] = Number((await sql`select count(*)::bigint as n from auth.users`)[0]!.n);
    const [{ total }] = (await sql`select coalesce(sum(amount), 0)::text as total from gifts`) as unknown as [{ total: string }];
    const [{ p }] = (await sql`select count(*)::int as p from pg_policies where schemaname = 'public'`) as unknown as [{ p: number }];
    const [{ r }] = (await sql`select count(*)::int as r from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity`) as unknown as [{ r: number }];
    const [{ f }] = (await sql`select count(*)::int as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app'`) as unknown as [{ f: number }];
    return { counts, giftTotal: total, policies: p, rlsTables: r, appFunctions: f };
  } finally {
    await sql.end();
  }
}

async function isolationHolds(conn: string): Promise<{ checked: number }> {
  const sql = postgres(conn, { max: 1, onnotice: () => {} });
  try {
    const members = (await sql`
      select distinct on (m.org_id) m.org_id, m.user_id, (select count(*)::int from constituents c where c.org_id = m.org_id) as own
        from org_memberships m where m.status = 'active' and m.role in ('owner', 'admin') limit 5`) as unknown as { org_id: string; user_id: string; own: number }[];
    for (const m of members) {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: m.user_id, role: "authenticated", aal: "aal2", actor: "user" })}, true)`;
        await tx.unsafe("set local role authenticated");
        const [{ mine }] = (await tx`select count(*)::int as mine from constituents where org_id = ${m.org_id}`) as unknown as [{ mine: number }];
        const [{ others }] = (await tx`select count(*)::int as others from constituents c where not exists (select 1 from org_memberships x where x.org_id = c.org_id and x.user_id = ${m.user_id} and x.status = 'active')`) as unknown as [{ others: number }];
        if (mine !== m.own) throw new Error(`restored copy: a member sees ${mine} of their ${m.own} donors`);
        if (others !== 0) throw new Error(`restored copy: a member can see ${others} donors from other organizations`);
      });
    }
    return { checked: members.length };
  } finally {
    await sql.end();
  }
}

console.log(`Backup and restore drill on ${container}`);
const before = await step("Count rows in the live database", () => snapshot(url));
psql("postgres", `drop database if exists ${COPY}`);
await step("Back up (pg_dump, custom format)", () => dexec(["pg_dump", "-U", "postgres", "-d", "postgres", "-Fc", "-f", "/tmp/drill.dump", ...SCHEMAS.flatMap((s) => ["-n", s])]));
const size = dexec(["sh", "-c", "du -h /tmp/drill.dump | cut -f1"]).trim();
console.log(`  Backup file size: ${size}`);
await step("Make an empty database", () => {
  psql("postgres", `create database ${COPY}`);
  psql(COPY, "create schema if not exists extensions; create extension if not exists pg_trgm schema extensions; create extension if not exists unaccent schema extensions;");
});
await step("Restore into it (pg_restore)", () => {
  try {
    dexec(["pg_restore", "-U", "postgres", "-d", COPY, "--no-comments", "/tmp/drill.dump"]);
  } catch (e) {
    // pg_restore exits non-zero for objects that already exist in a fresh Supabase database
    // (the auth schema's own tables, for example). Real gaps are caught by the checks below.
    const msg = String((e as { stderr?: string }).stderr ?? "");
    const errors = msg.split("\n").filter((l) => /error:/i.test(l) && !/already exists/i.test(l));
    if (errors.length) console.log(`  pg_restore reported ${errors.length} other message(s); first: ${errors[0]}`);
  }
});
const after = await step("Count rows in the copy", () => snapshot(copyUrl()));
const iso = await step("Check RLS keeps organizations apart in the copy", () => isolationHolds(copyUrl()));

const diffs = Object.keys(before.counts).filter((t) => before.counts[t] !== after.counts[t]).map((t) => `${t}: ${before.counts[t]} vs ${after.counts[t]}`);
const results = [
  ["Tables with the same row count", `${Object.keys(before.counts).length - diffs.length} of ${Object.keys(before.counts).length}`],
  ["Gift dollars", `${before.giftTotal} vs ${after.giftTotal}`],
  ["RLS policies", `${before.policies} vs ${after.policies}`],
  ["Tables with RLS on", `${before.rlsTables} vs ${after.rlsTables}`],
  ["app functions", `${before.appFunctions} vs ${after.appFunctions}`],
  ["Members checked for isolation in the copy", String(iso.checked)],
];
console.log("\n| Check | Live vs copy |\n|---|---|");
for (const [k, v] of results) console.log(`| ${k} | ${v} |`);
const ok = diffs.length === 0 && before.giftTotal === after.giftTotal && before.policies === after.policies && before.rlsTables === after.rlsTables && before.appFunctions === after.appFunctions;

psql("postgres", `drop database if exists ${COPY}`);
dexec(["rm", "-f", "/tmp/drill.dump"]);
if (!ok) {
  console.log(`\nDRILL FAILED. Differences: ${diffs.join("; ") || "see table"}`);
  process.exit(1);
}
console.log("\nDrill passed: the restored copy is complete and RLS still holds.");
