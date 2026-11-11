import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Request counts for rate limits (launch review, must fix 3). Not tenant data: one row per
 * limit per time window, such as "checkout by this visitor in this 10 minutes". Visitors
 * appear only as a keyed hash of their IP address, never the address itself.
 *
 * Nobody reads or writes this table directly. RLS is on with no policies, and the only way
 * in is app.hit_rate_limit() in drizzle/custom/0015_rate_limits.sql. A daily job deletes
 * windows older than a day.
 */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    hits: integer("hits").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.windowStart] })],
);
