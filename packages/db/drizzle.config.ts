import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" },
  // Supabase manages these schemas. Never let drizzle-kit touch them.
  schemaFilter: ["public", "app"],
  strict: true,
  verbose: true,
});
