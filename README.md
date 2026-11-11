# Rootwell

Setting up on a new computer? Follow `docs/setup-new-computer.md`.

A lightweight, multi-tenant donor database for tiny nonprofits. See `docs/lite-donor-crm-build-brief.md` for what and why, and `docs/build-plan.md` for how.

## Layout

```
apps/web        Next.js app: UI, API routes, background jobs, PWA
apps/mobile     Expo app (Phase 7, not yet created)
packages/db     Drizzle schema, migrations, RLS policies, triggers, seed
packages/core   Domain logic with no framework imports
packages/api    Hono API and its typed client
packages/config Shared tsconfig
docs/           Brief, build plan, one page per phase
```

## Local setup

1. Install Node 24 (`.nvmrc`), then `corepack enable` so `pnpm` is available.
2. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ (Apple silicon build) and open it once. The Supabase CLI is a dev dependency, so no separate install is needed.
3. `pnpm install`
4. `pnpm db:start` from the repo root, then copy the printed values into `apps/web/.env.local` and `packages/db/.env` using `.env.example` as the template.
5. `pnpm db:migrate` to apply migrations to the local database.
6. `pnpm dev` and open http://localhost:3000. Emails sent locally (sign-in links, invites) show up at http://127.0.0.1:54324 instead of a real inbox.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Runs every app in dev mode |
| `pnpm build` | Builds every package and app |
| `pnpm lint` | ESLint across the repo |
| `pnpm typecheck` | TypeScript across the repo |
| `pnpm test` | Unit tests. Database tests run only when `DATABASE_URL` is set |
| `pnpm db:generate` | Generates a SQL migration from schema changes |
| `pnpm db:migrate` | Applies migrations |

Homebrew is not required for anything in this repo.

## Two-step sign-in while testing

Owners and admins must set up an authenticator app before they can manage an organization, and the database refuses their sensitive writes without it. For local testing, put `MFA_ENFORCEMENT=off` in `apps/web/.env.local` and restart `pnpm dev`. The switch is ignored in production builds. Set it back to `on` (or remove it) to test the real flow.

## Email templates

Auth emails (invitations, sign-in links, confirmations) use the templates in `supabase/templates/`. They link to `/auth/callback` with a token hash. After changing a template or `supabase/config.toml`, restart with `pnpm db:stop` then `pnpm db:start`. A hosted Supabase project needs the same templates pasted into its dashboard.

## Docker note

The Supabase CLI talks to Docker through a socket. If `pnpm db:start` says it cannot reach Docker, open Docker Desktop, go to Settings, Advanced, and turn on "Allow the default Docker socket location" (it asks for your Mac password once). Until then, run commands with the user socket instead:

```bash
DOCKER_HOST=unix://$HOME/.docker/run/docker.sock pnpm db:start
```
