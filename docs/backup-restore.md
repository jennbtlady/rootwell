# Backup and restore

Phase 6 drill: prove that a backup of the database can be restored, complete and still
safe, and record how long it takes.

## What protects the data

1. **Supabase's own backups.** Every paid Supabase project gets daily backups. Point-in-time
   recovery is an add-on that restores to any second in the last 7 days or more. Turn it
   on for production before the first customer. Restores are started from the Supabase
   dashboard (Database, Backups).
2. **Our own copy, weekly.** A `pg_dump` of our schemas (`public`, `app`, `auth`,
   `drizzle`) to storage outside Supabase. If the Supabase project itself were lost, this
   is what we restore from. The drill below proves this path works.
3. **Each organization's own export.** Owners and admins can download everything as
   spreadsheets from Settings, Account and export, at any time, even while read only.

## The drill

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter @maple/db backup-drill
```

The script does each of these and times it:

1. Counts every table and adds up gift dollars in the live database.
2. Backs up with `pg_dump -Fc` (custom format, compressed).
3. Makes a brand-new empty database and restores into it with `pg_restore`.
4. Counts again in the copy and compares, table by table, along with the gift dollar
   total, the number of RLS policies, the tables with RLS on, and the `app` functions.
5. Signs in, inside the copy, as owners from five organizations. Checks each sees all of
   their own donors and none from any other organization.
6. Removes the copy.

It fails loudly if anything differs.

## Results, 2026-10-20

Run on the local database while it held the load test data: 500,000 donors and 1.5 million
gifts in 50 organizations, plus the test organizations.

| Step | Time |
|---|---|
| Count rows in the live database | 1.0 s |
| Back up (`pg_dump -Fc`), 141 MB file | 12.8 s |
| Make an empty database | 0.4 s |
| Restore (`pg_restore`) | 29.1 s |
| Count rows in the copy | 0.3 s |
| Check isolation in the copy | 0.6 s |

| Check | Live vs copy |
|---|---|
| Tables with the same row count | 33 of 33 |
| Gift dollars | 381,917,129.00 vs 381,917,129.00 |
| RLS policies | 157 vs 157 |
| Tables with RLS on | 32 vs 32 |
| `app` functions | 55 vs 55 |
| Owners checked: see all their donors, none of anyone else's | 5 of 5 |

`pg_restore` printed 51 messages of the form "must be able to SET ROLE supabase_admin".
They are about objects in Supabase's `auth` schema that Supabase's own admin role owns,
and that an ordinary role cannot hand over. Every row, policy, and function still matched,
as the checks show. On a hosted restore, use the `--data-only` steps below, which avoid
this.

A full restore of a database this size takes under a minute. A real customer database
will be far smaller.

## Restoring a hosted project from our own copy

Use Postgres 17 tools on any machine.

1. Make a new Supabase project in the same region. Run `pnpm db:migrate` against it. That
   creates the roles, extensions, and every function and policy.
2. Restore the data only, so the policies from step 1 stay as they are:

   ```bash
   pg_restore --data-only --disable-triggers -d "$NEW_DATABASE_URL" backup.dump
   ```

3. Run the drill's checks against the new project: row counts, gift dollar total, and the
   isolation check.
4. Point Vercel's `DATABASE_URL` and the Supabase keys at the new project. Redeploy.

## Taking the weekly copy

A scheduled job (GitHub Actions, weekly) runs:

```bash
pg_dump -Fc -n public -n app -n auth -n drizzle "$PRODUCTION_DIRECT_URL" -f backup.dump
```

It then uploads the file, encrypted, to storage outside Supabase, and keeps 8 weeks. This
needs the production connection string as a GitHub secret. It is set up with the hosted
project (Phase 0 task list).
