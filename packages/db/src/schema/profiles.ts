import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * App-level mirror of auth.users. The foreign key to auth.users(id) and the trigger that
 * inserts a profile on signup live in drizzle/custom/0001_rls.sql, because drizzle-kit does
 * not manage the auth schema.
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});
