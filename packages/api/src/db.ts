import { createDb, type Db } from "@maple/db";

// Kept on globalThis, not in a module variable: in development, Next reloads this module
// after every edit, and a module variable would open a new pool of connections each time
// without closing the old one, until Postgres runs out of connection slots.
const g = globalThis as unknown as { __mapleDb?: Db };

/** One pooled handle per process. Route handlers always go through withRls(). */
export function getDb(): Db {
  g.__mapleDb ??= createDb();
  return g.__mapleDb;
}

/** For tests. */
export function setDb(d: Db | undefined) {
  g.__mapleDb = d;
}
