import { createDb, type Db } from "@maple/db";

let db: Db | undefined;

/** One pooled handle per process. Route handlers always go through withRls(). */
export function getDb(): Db {
  db ??= createDb();
  return db;
}

/** For tests. */
export function setDb(d: Db | undefined) {
  db = d;
}
