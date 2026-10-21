# Load test

Phase 6 brief item: a load test with 50 organizations of 10,000 constituents.

## How to run it

```bash
DATABASE_URL=... pnpm --filter @maple/api load-test        # seed, measure, remove
DATABASE_URL=... KEEP=1 pnpm --filter @maple/api load-test # keep the data afterwards
DATABASE_URL=... REUSE=1 pnpm --filter @maple/api load-test # measure kept data again
DATABASE_URL=... CLEAN=1 pnpm --filter @maple/api load-test # remove kept data
```

It refuses a database URL containing "prod". Point it at a hosted staging project to
measure there.

**What it loads:**
- 50 organizations, each with 10,000 donors (realistic US names), an email and address
  each, 3 funds, and 3 posted gifts per donor.
- In total, 500,000 donors and 1.5 million gifts.
- It loads with triggers off and fills those columns itself. That took about 5 minutes on
  a laptop.

**How it measures:** through the real API, with RLS on, as a signed-in owner. It first
checks that each organization shows exactly its own donors.

## Results, 2026-10-20

Laptop: Apple silicon, local Supabase in Docker with 4 GB of memory. A hosted database will
differ. Rerun on staging before launch.

| What | Runs | Median | 95th percentile |
|---|---|---|---|
| Donor search | 30 | 80 ms | 136 ms |
| Donor list, first page | 30 | 74 ms | 221 ms |
| Donor record | 30 | 7 ms | 31 ms |
| Add a donor | 20 | 22 ms | 43 ms |
| Unthanked gifts list | 20 | 299 ms | 393 ms |
| Data health | 20 | 248 ms | 539 ms |
| Dashboard refresh | 10 | 482 ms | 568 ms |
| Dashboard view | 20 | 8 ms | 20 ms |
| LYBUNT report | 10 | 475 ms | 1.6 s |
| Gifts by fund report | 10 | 191 ms | 284 ms |
| Download everything (zip, 10,000 donors) | 3 | 1.4 s | 5.3 s |
| Duplicate scan, whole organization | 1 | 4.9 s | |
| 50 searches at the same moment, one per organization | 50 | 1.2 s | 1.6 s |

## What the first run found, and the fixes

The first run did not finish. Fifty searches at once crashed the local database: a
Postgres process ran out of memory and the server restarted. Three causes:

1. **Policies checked roles once per row.**
   - The cause: every RLS policy called a security definer function per row, and each call
     ran its own membership lookup.
   - The fix, in `drizzle/custom/0098_rls_performance.sql`: it rewrites every policy, with
     the same meaning, to compare `org_id` against a list worked out once per query. All
     83 policies were rewritten.
   - Proof the rewrite changed nothing about access: the isolation, roles, and route matrix
     tests pass unchanged.
2. **Donor and batch totals summed every gift in the database.**
   - The cause: the donor list's gift totals came from a subquery over the whole gifts
     table, and so did the batch list's.
   - The fix: both are now per-row lookups through existing indexes, in
     `packages/core/src/services/constituents.ts` and `gifts.ts`.
3. **The whole-organization duplicate scan took minutes.**
   - The cause: it ran person by person, and its name rule let the trigram index return
     far more rows than the 0.6 cutoff keeps.
   - The fix, in `drizzle/custom/0010_scale.sql`: it now finds pairs in one pass per rule,
     and compares names within groups that share a first or last name.
   - Times for 10,000 donors went from over 10 minutes (stopped), to 158 s, to 4.9 s.
   - Trade-off: it finds 98.6% of the pairs a full comparison finds. The rest differ in both
     first and last name. The check that runs whenever a donor is added still compares
     against every name.

## Watch list

- **Download everything** and the **duplicate scan** run inside one web request. They are
  fine at 10,000 donors. Before customers pass about 25,000 donors, move both to
  background jobs with progress, as the plan intends with Inngest. Inngest is not set up
  yet.
- The LYBUNT report's slowest run was 1.6 s. It is acceptable, but it is the next report
  to tune if it grows.
- Connection pooling: on Vercel, use Supabase's pooled connection string (Supavisor,
  transaction mode). Each request opens one transaction.
