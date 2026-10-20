import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies drizzle-kit migrations, then every file in drizzle/custom/ in name order.
 * Custom files hold what drizzle-kit cannot express well: functions, triggers, RLS
 * policies, and references into Supabase's auth schema. They must be idempotent
 * (create or replace, drop policy if exists) because they run on every migrate.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  await migrate(db, { migrationsFolder: join(import.meta.dirname, "..", "drizzle") });

  const customDir = join(import.meta.dirname, "..", "drizzle", "custom");
  const files = readdirSync(customDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    process.stdout.write(`custom: ${f}\n`);
    await client.unsafe(readFileSync(join(customDir, f), "utf8"));
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
