# CLAUDE.md

Read `docs/lite-donor-crm-build-brief.md` and `docs/build-plan.md` before starting any task. Then read the `docs/phase-*.md` page for the phase you are working in. Ask before changing the data model.

## What this is

A multi-tenant donor CRM SaaS for nonprofits with 1 to 5 staff. One person maintains it. Prefer boring, well-documented libraries over clever ones.

## Repo map

- `apps/web`: Next.js App Router. UI, the Hono API mounted at `src/app/api/v1/[[...route]]/route.ts`, Inngest functions, PWA manifest.
- `apps/mobile`: Expo app. Created in Phase 7. Calls the same API as the web client.
- `packages/db`: Drizzle schema in `src/schema/`, generated migrations in `drizzle/`, hand-written SQL (RLS policies, functions, triggers) in `drizzle/custom/`. The RLS transaction helper is `src/rls.ts`.
- `packages/core`: domain logic. Zod schemas, gift standards engine, duplicate scoring, merge, FEP metrics, import mapping. No React, no Next.js, no Hono imports allowed here.
- `packages/api`: Hono app wiring core services to HTTP, plus the typed client in `src/client.ts`.
- `packages/config`: shared tsconfig.
- `docs/`: brief, build plan, one page per phase.

Package scope is `@maple/*`. The product name is not final. Renaming the scope is a find-and-replace.

## Hard rules

1. Every tenant-scoped table has `org_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, and RLS policies. Application code never relies on `WHERE org_id =` alone.
2. Every database read or write runs inside `withRls()` from `packages/db`. There is no plain database handle in application code. Background jobs use a system claim scoped to one org; they never use the service role key to skip RLS.
3. Write the isolation test before the feature. The table matrix test in `packages/db/test` is generated from the schema, so a new tenant table is covered automatically, but a new API route needs a route-matrix entry.
4. No business mutation lives in a Next.js Server Action. Writes go through a service function in `packages/core`, exposed by a route in `packages/api`. Server Components may call core services directly for reads.
5. Every schema change is a Drizzle migration with a rollback note in the PR. Never edit a migration that has been applied.
6. No feature is done without a seed update for the sample org and a `docs/` note.
7. Accessibility is part of done. Label every input. Test keyboard flow on every form. Test at 375px width.
8. Keep PII out of logs, committed fixtures, error messages and Sentry events. Fixture people are invented.
9. Commit small. One PR per phase milestone with a checklist against the acceptance criteria in the brief.
10. Writing in the UI and docs: plain language, short sentences, no jargon a volunteer treasurer would not know. No em dashes anywhere, including code comments.

## Design system

Read `docs/design-system.md` before touching UI. It is short and it is the whole contract: build screens from `@/components/ui`, use Paste token names (`bg-background-primary`, `text-text-weak`, `text-30`, `rounded-30`, `shadow-focus`), never Tailwind palette colors or `text-sm`. Design changes go in `packages/design/overrides.css`, not in components. New components are ported from Paste's source using the mapping table in that doc. Check `/design` in the browser when you add or change one.

## Next.js note

`apps/web` is on Next.js 16. Its conventions differ from older versions. Read `apps/web/node_modules/next/dist/docs/` before writing Next-specific code, as `apps/web/AGENTS.md` says.

## Commands

`pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm db:generate`, `pnpm db:migrate`. Database tests need a running local Supabase and `DATABASE_URL`.
