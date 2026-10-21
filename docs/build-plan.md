# Build Plan: Lite Donor CRM, web and mobile

Companion to `lite-donor-crm-build-brief.md`. Name: Rootwell (was the working name Rootwell). Owner: Jenn Howe, Noble Maple Consulting. Date: 2026-10-20.

This plan keeps everything in the brief and changes one thing: mobile moves from "not in v1" to a planned phase. It explains how to build the web app so the mobile app reuses all of it.

## 1. The recommendation in five lines

1. Ship the web app first, built mobile-first so it works well in a phone browser and installs as a PWA (an installable web app with a home screen icon). That covers most "I need it on my phone" moments with no app store review.
2. Build a monorepo from day one with a shared, typed API. The web app and the mobile app call the same business logic. There is never a second backend.
3. Build the native iOS and Android app with Expo (React Native) after the dashboard phase, scoped as a field companion: look up a donor, log a call, enter a gift at an event, check the dashboard, work the thank-you queue.
4. Keep imports, merges, settings, billing and templates on the web only. Nobody migrates a spreadsheet on a phone.
5. Never sell the subscription inside the mobile app. Sign-in only. This avoids Apple and Google in-app purchase rules and fees.

## 2. What changes versus the brief

| Brief section | Change | Why |
|---|---|---|
| 2 Non-goals | "Mobile apps" becomes Phase 7 and 8 | Jenn wants both. Web still ships first. |
| 3 Stack | Add pnpm workspaces + Turborepo, Hono (API layer inside Next.js), Expo, NativeWind, TanStack Query, @react-pdf/renderer, SheetJS + Papaparse, react-email | Monorepo and a real API are what make mobile cheap. The rest fills gaps the brief left open (PDFs, spreadsheet parsing, email templates). |
| 7 Phases | Phase 0 gains a "mobile-ready" checklist. Phase 1 and 4 gain mobile-first layouts and API endpoints the app will need. Phases 7 and 8 are new. | Avoids a rewrite when the app starts. |
| 8 Conventions | New rule: no business mutation lives in a Next.js Server Action. Every write goes through a service function in `packages/core`, exposed by `packages/api`. | Server Actions cannot be called from a native app. |

Everything else in the brief stands: Supabase, Drizzle, Tailwind + shadcn/ui, Inngest, Stripe Billing, Resend, Vercel, Vitest + Playwright, Sentry, the data model, the feature specs, the security requirements.

## 3. Architecture

### 3.1 Repo layout

```
rootwell/
  apps/
    web/            Next.js App Router. UI, API routes (Hono), Inngest functions, PWA manifest
    mobile/         Expo app (added in Phase 7)
  packages/
    db/             Drizzle schema, migrations, RLS policy SQL, triggers, seed data, sample org
    core/           Domain logic with no framework imports: Zod schemas, gift standards engine,
                    duplicate scoring, merge and unmerge, FEP metric calculations, import mapping
                    and validation, statement and acknowledgment rendering, QBO export
    api/            Hono app wiring core services to HTTP. Exports a typed client (hono/client)
                    used by web client components and by the mobile app
    email/          react-email templates (acknowledgments, invites, statements cover email)
    config/         Shared eslint, tsconfig, tailwind tokens
  docs/             One page per phase, plus the printable Gift Entry Standards and the continuity page copy
  CLAUDE.md
```

Rule of thumb: if a function would be useful from a phone, it lives in `packages/core`, not in a React component.

### 3.2 Data access and tenant isolation

- Drizzle talks to Postgres directly, which bypasses Supabase RLS unless the connection takes on the user's identity. So every request runs inside a transaction helper that does `set local role authenticated` and `set local request.jwt.claims = '<the user's JWT claims>'`. Drizzle's RLS helpers support this. All reads and writes go through that helper. There is no "plain" database handle in application code.
- supabase-js is used only for auth, storage and realtime. Not for tenant data. One data path means one thing to test.
- Background jobs do not use the service role key to skip RLS. They run inside the same transaction helper with a synthetic claim `{ sub: 'system', org_id: <org>, role: 'system' }`. Policies allow `system` for one org at a time. The brief's rule that code never relies on `WHERE org_id =` alone then holds for jobs too.
- Audit log is written by Postgres triggers on `constituents`, `gifts`, `relationships`, `interactions`, `pledges`, `recurring_plans`, `merge_history` and `organizations`. The actor comes from the JWT claim in the transaction. Triggers mean no code path can forget to log, including merges and imports.

### 3.3 RLS policy design

- `org_memberships(org_id, user_id, role, status)` is the source of truth.
- Two helper functions, `security definer`, `stable`: `app.member_org_ids()` returns the org ids where the current user is an active member. `app.has_role(org_id, roles text[])` checks role membership. Both read `request.jwt.claims`.
- Every tenant table gets four policies. Select: `org_id in app.member_org_ids()` and role is not `board_viewer` (except the tables listed below). Insert and update: `app.has_role(org_id, '{owner,admin,staff,system}')`. Delete: `app.has_role(org_id, '{owner,admin,system}')`.
- `board_viewer` can select only `dashboard_snapshots` and `report_snapshots`. They never have a policy on `constituents`, `gifts`, `interactions` or any table with PII. The board share link renders from snapshots on the server, with the org's "hide names" toggle applied at snapshot time, so names never reach the browser unless the org allowed it.
- Owner and admin mutations on `organizations`, `org_memberships`, `integrations` and batch posting require the JWT claim `aal = 'aal2'`, which is Supabase's signal that MFA was completed. MFA enforcement lives in the database, not only in the UI.
- Share links are unguessable tokens stored hashed, with an org-level revoke. A revoked token returns 404 with an empty body.
- Ownership transfer and the support override are Postgres functions that write a dedicated `ownership_events` row. The support override requires a Noble Maple staff claim and a reason string.

### 3.4 Isolation test plan

Runs in CI on every pull request against a local Supabase (Postgres in Docker via the Supabase CLI). Vitest, real database, no mocks.

- Fixture: org A and org B, each with an owner, admin, staff and board_viewer user, each with MFA enrolled and un-enrolled variants.
- Table matrix, generated from the Drizzle schema so a new table cannot be forgotten: as each A user, select every tenant table and assert only A rows come back. Insert a row with `org_id = B` and assert it fails. Update and delete a B row by id and assert zero rows affected.
- Route matrix: call every API route as user A with ids that belong to B. Assert 404 or 403, assert the response body contains no B data and no B identifiers.
- Role matrix: staff cannot post a batch, board_viewer cannot read a constituent, admin cannot transfer ownership, owner without aal2 cannot change integrations.
- Job tests: run the dedupe scan and the snapshot job for org A and assert nothing in B changed.
- Share link tests: payload contains no email, phone or address under any toggle. Revoked token is a 404.
- Export test: an owner's full export contains only their org, and every table in the schema is present in the zip.

A failing isolation test blocks the merge. No exceptions.

### 3.5 Auth

- Web: Supabase Auth with magic link and password, `@supabase/ssr` cookie sessions, middleware that refreshes tokens and blocks owner and admin pages until MFA is complete.
- Mobile: supabase-js with `expo-secure-store` for the session, a deep link for magic links, TOTP MFA using the same enrollment the user did on the web. The mobile app sends the Supabase access token as a bearer token to the API.
- Roles are read from `org_memberships`, never from a JWT custom claim, so a role change takes effect immediately.

### 3.6 API

- Hono mounted at `apps/web/app/api/[[...route]]/route.ts`. Every route validates input with the Zod schemas in `packages/core`. Every handler opens the RLS transaction, calls a core service, returns typed JSON.
- `packages/api` exports the typed client. Web client components and the mobile app get full type safety and autocompletion against the live routes. No OpenAPI generation step to maintain.
- Web Server Components read through core services directly (same RLS helper, no HTTP hop). Web mutations and all mobile traffic go over the API.
- Versioning: a `/api/v1` prefix from day one, because a shipped mobile app cannot be force-updated the same day the API changes.

### 3.7 Jobs, files, PDFs, email

- Inngest for imports, dedupe scans, nightly snapshots, integration syncs, bulk acknowledgments and annual statements. Step functions give retries and progress without hand-rolled queues. If vendor count matters more than that, Supabase cron plus `pg_net` is the fallback, but imports of 5,000 rows with duplicate review are easier as Inngest steps.
- Supabase Storage for logos, uploaded import files and generated PDFs, with bucket policies scoped by org path.
- PDFs with `@react-pdf/renderer`, pure JavaScript, no headless browser to host. Letters and statements are React components shared by the queue preview and the bulk job.
- Email with Resend and `react-email`. Acknowledgment and statement emails share the merge-field engine with the letters.

### 3.8 Mobile app stack (Phase 7)

- Expo with Expo Router (file-based routes, matches the Next.js mental model), TypeScript, NativeWind so the Tailwind tokens from `packages/config` carry over, TanStack Query with persistence for a read cache, Sentry for React Native.
- EAS Build for binaries, EAS Update for over-the-air fixes to JavaScript, EAS Submit for store uploads. One person can run this.
- Testing: Jest with React Native Testing Library for components, Maestro for on-device flows (sign in, find a donor, log a call, enter a gift).
- Accessibility: every control has an accessibility label and role, Dynamic Type respected, VoiceOver and TalkBack checked on the four core flows.

## 4. Phases

Phases 0 to 6 are the brief's phases with additions marked "Mobile-ready". Each phase still ends with passing tests, an updated sample org, and a `docs/` page.

### Phase 0: Foundation
Brief scope: repo, Supabase, Drizzle migrations, auth, orgs, memberships, roles, RLS, isolation tests, Stripe Billing skeleton, Sentry.
Mobile-ready additions:
- Monorepo with `apps/web`, `packages/db`, `packages/core`, `packages/api`, `packages/config`.
- Hono API with `/api/v1/me` and `/api/v1/orgs` routes, bearer token auth tested with curl against a Supabase access token.
- The RLS transaction helper and the generated table matrix test.
- Audit log triggers.
- PWA manifest and icons, so "add to home screen" works from the first deploy.
Done when: the brief's criteria, plus a curl call with org A's token cannot read org B through any route.

### Phase 1: Constituents and gifts
Brief scope: constituent CRUD, search, relationships, interactions, tags, funds, campaigns, appeals, gift entry standards, guided gift form, batches, posting, audit log.
Mobile-ready additions:
- Gift standards engine and duplicate-on-select live in `packages/core` with unit tests, no React in them.
- Mobile-first layouts for the four screens the app will later mirror: donor search, donor profile, log an interaction, quick gift into an open batch. Test them at 375px width in Playwright.
- API routes for all of the above.

### Phase 2: Clean data
As the brief. Scoring and merge logic in `packages/core`. Merge UI is web only.

### Phase 3: Import wizard
As the brief. Web only. Parsing with SheetJS and Papaparse inside an Inngest job.

### Phase 4: Dashboard, reports, acknowledgments
Brief scope: snapshot job, dashboard, share link, saved reports, templates, queue, annual statements.
Mobile-ready additions:
- `/api/v1/dashboard/latest` returns the snapshot the mobile app will render.
- Acknowledgment queue API supports "mark as sent" and "mark as thanked by phone" so the app can work the queue.

### Phase 5: Integrations
As the brief.

### Phase 6: Web launch readiness
As the brief. Add: a mobile browser pass on iOS Safari and Android Chrome for every form.

### Phase 7: Mobile companion app
Scope (in):
- Sign in with magic link or password, MFA, org switcher for consultants who belong to more than one org.
- Donor search and donor profile: giving summary, last five gifts, recent interactions, tap to call, tap to email, tap for directions.
- Log an interaction: type, date, summary. Queued offline, sent when back online.
- Quick gift entry into an open batch, enforcing the org's standards, with the same duplicate check on constituent selection. No posting from the app. Posting stays an admin action on the web.
- Dashboard: the latest snapshot, read only.
- Acknowledgment queue: see who is waiting, mark as sent or thanked by phone.
Scope (out, stays web only): import, merge, duplicates queue, settings, gift standards, billing, templates, exports, integrations, batch posting.
Done when: a staff user on a phone can find a donor, log a call, and enter a gift into a batch, and the admin sees all three on the web within seconds. Maestro flows pass on iOS and Android. Isolation tests cover every route the app calls.

### Phase 8: Mobile launch
- Push notifications: batch awaiting review (admin), new online gift over a threshold (owner, admin). Expo push with an Inngest fan-out.
- Store listings, screenshots, privacy labels (Apple privacy nutrition labels and Google data safety form, both declaring donor contact data as collected and not sold).
- TestFlight and Google internal testing with three friendly orgs for two weeks.
- Crash-free rate above 99.5% for a week before public listing.

### Rough timeline

Assumes one person directing Claude Code, part of each week. Ranges are calendar weeks.

| Phase | Weeks |
|---|---|
| 0 Foundation | 1 to 2 |
| 1 Constituents and gifts | 3 to 4 |
| 2 Clean data | 2 |
| 3 Import wizard | 2 to 3 |
| 4 Dashboard, reports, acknowledgments | 3 |
| 5 Integrations | 3 |
| 6 Web launch readiness | 2 |
| 7 Mobile companion | 4 |
| 8 Mobile launch | 2 to 3 |

Web beta around week 16 to 19. Mobile in stores around week 22 to 26. Phases 7 and 8 can overlap with early customers using the web app.

## 5. Things to start now because they take calendar time

- Apple Developer Program as an organization. Needs a D-U-N-S number for Noble Maple Consulting. Enrollment can take one to four weeks. Start it in Phase 0 even though the app is months out.
- Google Play developer account as an organization. Identity verification takes days. Organization accounts skip the closed-testing requirement that personal accounts have.
- Pick the bundle identifier from the company domain, not the product name, for example `com.noblemaple.ledger`. The product can be renamed later. A bundle identifier cannot.
- Supabase project in a US region (the brief assumes US only). Resend domain verification. Stripe account with a Billing product. Sentry org. Vercel team. Inngest account. Mailchimp developer app for OAuth.
- Decide the product name and domain before Phase 4, because the share link, acknowledgment emails and PDFs carry it.

## 6. Decisions needed from Jenn

From the brief's Section 9, still open:
- Product name and domain.
- Pricing tiers. Recommendation stands: one flat monthly price, 30-day trial, optional smaller tier under 500 constituents.
- Done-for-you migration add-on at launch.
- Starter import mapping priority.
- Whether board_viewer sees donor names by default. Recommendation: aggregates only by default, names on with the org toggle.
- Data residency: US only.

New for mobile:
- Confirm the sequence: web first, PWA from day one, native app after Phase 4. The alternative is native in v1, which adds roughly six weeks before the first customer and means every feature is built twice. Not recommended.
- Confirm the field companion scope in Phase 7. Anything added to it should be something a person does standing up.
- Confirm no in-app subscription purchase. The app is for existing subscribers to sign in.
- iOS and Android together, or iOS first. Expo makes both cheap, so both is the default.

## 7. Phase 0 task list

In order. Each is one or two Claude Code sessions.

1. Scaffold the monorepo: pnpm, Turborepo, shared tsconfig and eslint, `apps/web` with Next.js App Router and Tailwind, empty `packages/*`, CLAUDE.md with the brief's conventions plus the Server Action rule.
2. Supabase project and local setup: Supabase CLI, local Postgres in Docker, `pg_trgm` and `unaccent` enabled, environment variable layout documented.
3. Drizzle schema for `organizations`, `users`, `org_memberships`, `audit_log`, `ownership_events`. First migration with rollback.
4. RLS helpers, policies and audit triggers as SQL migrations. The RLS transaction helper in `packages/db`.
5. Generated table-matrix isolation test and the role-matrix test. CI workflow that starts Supabase and runs Vitest.
6. Auth: magic link and password, `@supabase/ssr`, MFA enrollment and challenge pages, middleware that enforces aal2 for owner and admin pages.
7. Org creation, invite flow with Resend, membership and role management, ownership transfer, sample org toggle.
8. Hono API at `/api/v1` with `me` and `orgs` routes, typed client exported, bearer auth tested with curl.
9. Stripe Billing skeleton: customer on org creation, trial subscription, webhook handler, customer portal link.
10. Sentry with a PII scrubber, PWA manifest and icons, Vercel preview deploys, `docs/phase-0.md`.

Suggested first prompt to Claude Code once the repo folder exists:

> Read docs/build-plan.md and lite-donor-crm-build-brief.md. Scaffold the monorepo described in build-plan section 3.1 and complete Phase 0 task 1. Do not create any tenant tables yet. Stop and show me the layout and CLAUDE.md before moving to task 2.
