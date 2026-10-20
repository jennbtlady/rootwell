# Phase 0: Foundation

Status: in progress. Task list is in `build-plan.md` section 7. Tasks 1 to 8 are done.

## Done so far

- Monorepo: pnpm workspaces and Turborepo. `apps/web`, `packages/config`, `packages/core`, `packages/db`, `packages/api`.
- `CLAUDE.md` with the working conventions, plus the rule that no business mutation lives in a Server Action.
- `packages/db`: Drizzle schema for `organizations`, `profiles`, `org_memberships`, `audit_log`, `ownership_events`. The RLS transaction helper `withRls()`. A migration runner that applies drizzle-kit migrations and then the hand-written SQL in `drizzle/custom/`.
- `drizzle/custom/0001_rls.sql`: identity helpers in the `app` schema, row metadata and audit triggers, RLS policies for every table, `app.create_organization()`, `app.transfer_ownership()`, `app.support_transfer_ownership()`, and the trigger that mirrors `auth.users` into `profiles` and claims pending invites.
- `packages/db/test`: the generated table-matrix isolation test (reads every table with an `org_id` column from the live database), plus the role and MFA matrix.
- `packages/api`: Hono app at `/api/v1` with `health`, `me`, and `orgs` routes. Bearer token verification against Supabase's JWKS (or the legacy secret). Typed client in `client.ts`.
- `apps/web`: mounts the API, PWA manifest, placeholder home page.
- GitHub Actions: lint, typecheck, unit tests, and a database job that starts Supabase and runs the isolation tests.
- Local Supabase via the CLI (a dev dependency): `supabase/config.toml` with TOTP MFA enabled. `pnpm db:start`, `pnpm db:migrate`, `pnpm test:db`. All 12 database tests pass against it.

- Auth (task 6): sign up, sign in with password or a one-time email link, sign out, and two-step sign-in with an authenticator app (TOTP). `src/proxy.ts` refreshes the session cookie and does the cheap signed-in check. The `/app` layout does the real gate: anyone with a verified authenticator must use it each session, and owners and admins must set one up before going further. shadcn/ui (base-nova preset) provides the form components. Pages: `/sign-in`, `/sign-up`, `/mfa/enroll`, `/mfa/verify`, `/app`, `/app/orgs/new`, `/app/orgs/[orgId]`.
- Core services (`packages/core/src/services`): `getMe`, `mfaRequiredFor`, `listMyOrgs`, `getOrg`, `createOrg`. API routes and Server Components both call these; nothing else touches the database.

- Team management (task 7): invite by email with a role, resend or cancel an invitation, change a non-owner's role, remove a member, transfer ownership. Page: `/app/orgs/[orgId]/members`. Staff and board viewers see the list read-only.
- Invitations ride on Supabase Auth: the API records the membership through `app.invite_member()`, then asks Auth to send its invite email. When the invited person is created in `auth.users`, a trigger links the membership; their first sign-in flips it to active. People who already have an account are added as active members right away. The invite link lands on `/account/password` so they can choose a password.
- Email templates live in `supabase/templates/` and link to our callback with a token hash, which works for server-sent invitations as well as browser-requested links. A hosted project must use the same templates (Supabase dashboard, Auth, Email Templates) and Resend as its custom SMTP.
- Sample organization: "Explore a sample organization" creates one demo org per person (`app.create_sample_org()`), labeled Sample everywhere, removable by its owner. Being owner of the sample does not trigger the MFA requirement. Phase 1 fills `app.seed_sample_data()` with constituents, funds and gifts.
- Data model note: `organizations.sample_org_enabled` now defaults to false and means "this organization is the demo one" (migration 0002). Rollback: set the default back to true.

## Verified by hand on 2026-10-20

Against local Supabase in the desktop app's browser: sign up, create an org through the API, forced authenticator enrollment for the new owner, sign out, password sign-in stopping at the code step, magic link from Mailpit (http://127.0.0.1:54324) landing on the callback and then the code step, a foreign org id returning 404, the main pages at 375px width, inviting a staff member, accepting the invitation from the Mailpit email, setting a password, seeing the team read-only as staff, and creating then removing the sample organization.

Local test sign-in created during that run: `pat-owner@test.invalid`, owner of "Riverside Food Pantry". Its password and authenticator key live only in the local database. Reset everything with `pnpm db:reset`.

## How identity reaches the database

Every query runs inside `withRls(db, claims, fn)`. The helper writes the claims into `request.jwt.claims` and switches the transaction to the `authenticated` Postgres role. Policies read the claims through `app.jwt()`, `app.uid()`, `app.member_org_ids()` and `app.has_role()`.

Three kinds of identity exist:

| Claims | Who | What they can reach |
|---|---|---|
| `actor: user, sub, aal` | A signed-in person | Their orgs, by role. `aal2` means MFA is done. |
| `actor: system, org_id` | A background job | One org only, all tables. |
| `actor: support, sub` | Noble Maple support tooling | Only the support override function. |

MFA (`aal2`) is required in the database for org updates, member management, and ownership transfer.

## Not yet done

A hosted Supabase project for staging and production (local is done). Playwright for the page flows above (Phase 1 sets it up). Tasks 9 (Stripe Billing) and 10 (Sentry, icons, Vercel). Both need accounts.
