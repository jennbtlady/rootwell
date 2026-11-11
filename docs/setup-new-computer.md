# Setting up Rootwell on a new computer

Written 2026-11-11, when the work moved off the first laptop. All the code is on GitHub
(`jennbtlady/rootwell`, branch `phase-6/launch-readiness`). Two settings files and the
local database are not in git on purpose. This page rebuilds them.

**For Claude:** when Jenn asks for help setting up, walk her through this page one step at
a time. Run the checks yourself where you can, and stop for her at anything that needs her
(installers, passwords, the Docker app). Never paste a key or secret into chat, into a
committed file, or into a command's output she has to read back. Write them straight into
the env files. When everything passes, read `CLAUDE.md` and `docs/phase-6.md` and pick up
from "What to work on next" at the end of this page.

## 1. Install the tools

| Tool | Why | Check it worked |
|---|---|---|
| Git | Gets the code | `git --version` |
| Node 24 (`.nvmrc` says 24) | Runs everything | `node --version` shows v24 |
| pnpm, through Corepack | Installs packages | `corepack enable`, then `pnpm --version` shows 12.14 |
| Docker Desktop, left running | The local database runs in it | `docker info` prints without an error |
| The Claude desktop app | For working with Claude | |

The Supabase command line tool comes with the project (`pnpm supabase`), so there is
nothing extra to install for it.

## 2. Get the code and packages

```bash
git clone https://github.com/jennbtlady/rootwell.git
cd rootwell
git checkout phase-6/launch-readiness
pnpm install
```

## 3. Start the local database

Docker Desktop must be running first.

```bash
pnpm db:start
```

The first start downloads several images and takes a few minutes. When it finishes it
prints a table of local addresses and keys. You need two of them in the next step:

- **Publishable key** (starts `sb_publishable_`)
- **Secret key** (starts `sb_secret_`)

To see them again later, run `pnpm supabase status`.

## 4. Make the two settings files

Both files are ignored by git. `.env.example` at the repo root explains every line.

### `packages/db/.env`

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

This is the standard local address. It is not a secret.

### `apps/web/.env.local`

| Line | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key from step 3 |
| `SUPABASE_SECRET_KEY` | The secret key from step 3 |
| `DATABASE_URL` | Same as in `packages/db/.env` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `MFA_ENFORCEMENT` | `off` (lets test owners skip the authenticator app; production ignores it) |
| `SMTP_URL` | `smtp://127.0.0.1:54325` (the local mail catcher) |
| `EMAIL_FROM` | `Rootwell <no-reply@example.com>` |
| `INTEGRATIONS_KEY` | A new random key, made with the command below |
| `CRON_SECRET` | Any long random string, made with the command below |

Leave every Stripe, Resend, Sentry and Inngest line out. Without them the app uses its
built-in stand-ins, which is what local work needs.

To make the two random values:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run it twice, once for each. They only need to stay the same on this computer.
`INTEGRATIONS_KEY` encrypts saved Mailchimp keys in the local database, so a new value
just means reconnecting Mailchimp's stand-in there.

## 5. Build the database

```bash
pnpm db:migrate
```

This creates every table, the security rules (RLS), and the sample organization's
function. Run it again after pulling changes that touch `packages/db`.

## 6. Run the app

```bash
pnpm dev
```

Open http://localhost:3000. Create an account, then choose "Explore a sample
organization" to see the app with three years of made-up data. Emails the app sends (sign
in links, thank-yous, statements) land in the local mail catcher at http://127.0.0.1:54324.

If sign-in says "Something went wrong", the keys in `.env.local` do not match the running
database. Copy them again from `pnpm supabase status` and restart `pnpm dev`.

## 7. Check everything works

```bash
pnpm typecheck
pnpm lint
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm test
```

All three should pass. On 2026-11-11 the counts were 52 database, 53 core, 47 API and 15
web unit tests.

The browser tests need a one-time browser download, and `pnpm dev` running in another
window:

```bash
pnpm --filter @maple/web exec playwright install chromium webkit
pnpm --filter @maple/web e2e
```

That run takes about ten minutes and had 67 passing. Leave files alone while it runs. The
dev server rebuilds pages when files change, and that causes false timeouts.

## 8. What to work on next

From the review on 2026-10-23. The findings, with file references, are in
`docs/phase-6.md` under "Launch review". This is the order.

**Security, before any paying customer:**

1. Two-step sign-in is enforced on pages, not on the API. A stolen owner password can
   download every donor through the API. Require two-step at the API (in
   `packages/api/src/auth.ts`) for anyone who should have it. Also require it for "download
   everything", report downloads, statements, and making board links.
2. Remove the `STRIPE_MODE=simulated` escape hatch in
   `packages/api/src/integrations/index.ts`, so the Stripe stand-ins can never run in
   production.
3. Add rate limits on public giving pages, board links, sign-in and the bulk email routes.
   Turn on captcha and email confirmation in the hosted Supabase project, and write the
   settings into `docs/`.

**Soon after:** let an owner delete their organization, add the missing security headers
(`apps/web/next.config.ts`), hide staff emails from board viewers, enforce invitation
expiry, and update `fflate` (one moderate advisory).

**Business side (Jenn):**
- A privacy policy and terms of service.
- The pricing number.
- The domain.
- Hosted Supabase (US region), Vercel, Resend and Sentry accounts.
- The Stripe product and price.
- A manual accessibility pass with a screen reader and 200% zoom (`docs/accessibility-audit.md`).

**Housekeeping:**
- The CI browser job in `.github/workflows/ci.yml` will fail as written. It runs against a
  production build, which ignores the test-only switches. Run it against `next dev`
  instead.
- `docs/phase-6.md` still says "no new tables or columns", which later changes made untrue.
