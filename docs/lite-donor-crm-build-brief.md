# Lite Donor CRM: Build Brief for Claude Code

Working name: TBD (placeholder: Maple Ledger). Owner: Jenn Howe, Noble Maple Consulting.

## 1. What we are building and why

A lightweight, multi-tenant donor database for tiny nonprofits (1 to 5 staff, budgets under about $1M) sold as a SaaS subscription. It competes with spreadsheets first and with Little Green Light, Bloomerang and Zeffy second.

The product thesis comes from research into what small nonprofit leaders actually complain about. The dominant CRM pain is process, not product: data entered by many people with no standards, nobody who can run a report, a "database person" who leaves and takes the knowledge with them, migrations that end with no documentation, and manual reconciliation between the CRM and QuickBooks. On top of that, donor counts have fallen five years running and first-time donor retention sits under 20%, yet most small orgs cannot produce a one-page board dashboard.

So the product bakes the operating discipline in. Every differentiator below maps to one of those complaints.

Differentiators (in priority order):

1. Guided gift entry with the org's own standards enforced (the gift-entry SOP lives in the software, not in someone's head).
2. Clean data by default: duplicate detection on entry, a merge tool, and a visible data health score.
3. A spreadsheet-to-CRM import wizard with duplicate review and rollback, so migration is a Saturday project, not a consulting engagement.
4. A board dashboard that exists out of the box, using Fundraising Effectiveness Project definitions, with a read-only shareable link.
5. Integrations that remove hand reconciliation: Stripe donations in, Mailchimp audience sync, QuickBooks deposit export.
6. Continuity guarantees: the org owns the account, admin transfer is a first-class feature, and a full export is always one click away.

Positioning and pricing are flat and simple (one price per tier, no per-record or per-contact pricing). Exact tiers are a business decision, not a build decision; see Section 9.

## 2. Non-goals for v1

Do not build these in v1. Note where a future hook belongs, then move on.

- Events module, ticketing, auctions
- Volunteer management
- Peer-to-peer or crowdfunding pages
- Grant management
- Built-in mass email (we sync to Mailchimp instead)
- Mobile apps (responsive web only)
- Workflow builder, custom objects, or Salesforce-style configurability
- AI features of any kind in v1. Later, AI assist for gift coding or note summaries may be added, but only with per-org opt-in and never sending donor PII to a third-party model without that opt-in.

## 3. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) with TypeScript | One codebase for UI and API routes; Claude Code is highly productive in it; Vercel deploys are trivial |
| Database and auth | Supabase (Postgres, Auth, Storage) | Row-level security gives tenant isolation at the database layer; Postgres `pg_trgm` and `unaccent` handle fuzzy duplicate matching; generous free tier for early customers |
| ORM and migrations | Drizzle ORM | Type-safe, SQL-close, migrations checked into the repo |
| UI | Tailwind CSS + shadcn/ui | Accessible components, fast to build, easy to theme |
| Background jobs | Inngest (or Supabase cron plus edge functions if we want fewer vendors) | Imports, dedupe scans, integration syncs and nightly dashboard rollups run off the request path |
| Billing | Stripe Billing | Subscription tiers, customer portal, webhooks |
| Transactional email | Resend | Acknowledgment emails, invites, password resets |
| Hosting | Vercel (app) + Supabase (data) | Minimal ops for a one-person company |
| Testing | Vitest (unit), Playwright (e2e) | RLS and tenant isolation must have automated tests |
| Monitoring | Sentry + Vercel analytics | Errors and performance from day one |

Rejected alternatives: a WordPress plugin (not multi-tenant SaaS, hard to secure at scale); Rails (perfectly good, but the TypeScript end-to-end story is cleaner here); Firebase (relational data and reporting are the core, so Postgres wins).

## 4. Multi-tenancy and security requirements

These are hard requirements, not suggestions.

- Every tenant-scoped table carries `org_id`. RLS policies enforce isolation; application code never relies on `WHERE org_id =` alone.
- Roles per org: `owner`, `admin`, `staff`, `board_viewer` (dashboard and reports only, no PII export).
- Ownership transfer: an owner can transfer ownership to another user; Noble Maple support can transfer ownership with an audited action if the owner is unreachable (this solves the "former ED still owns the account" problem).
- Audit log on every create, update, delete and merge of constituents and gifts: who, when, what changed (before and after JSON).
- Integration tokens encrypted at rest (Supabase Vault or app-level envelope encryption). Never logged.
- No PII in application logs or error reports (scrub in the Sentry pipeline).
- Full data export (CSV per table, plus a single zip) available to owners at any time, no support ticket required.
- MFA available to all users; enforced for owner and admin roles.
- WCAG 2.1 AA for all UI. Keyboard navigation and screen reader labels on every form.
- Automated tests that prove a user in org A cannot read or write org B data through any route.

## 5. Data model (v1)

Core entities. Use `snake_case` in Postgres, UUID primary keys, `created_at`, `updated_at`, `created_by`, `updated_by` on everything tenant-scoped.

- `organizations`: name, EIN, address, fiscal year start month, timezone, logo, gift entry standards (JSON config, see Section 6), subscription state.
- `users` and `org_memberships`: role, invited_by, status.
- `constituents`: type (`person` | `household` | `organization`), name fields, preferred name, email(s), phone(s), address(es) with type and primary flag, do-not-contact flags, deceased flag, tags, source, assigned_to, custom fields (small JSON bag, capped), `search_vector`.
- `relationships`: constituent to constituent with a type (spouse, employer, board member of, etc.).
- `funds`, `campaigns`, `appeals`: the three standard gift coding dimensions. Each has a name, code, active flag, date range.
- `gifts`: constituent_id, amount, date, fund_id, campaign_id, appeal_id, payment_method, gift_type (`one_time` | `recurring` | `pledge` | `pledge_payment` | `in_kind` | `soft_credit`), check number, reference, external_source (`manual` | `stripe` | `import`), external_id, fair market value for in-kind, deductible amount, acknowledged_at, acknowledgment_method, notes, batch_id.
- `recurring_plans` and `pledges` with schedules and balances.
- `interactions`: calls, meetings, emails logged against a constituent, with date, type, summary, owner.
- `acknowledgment_templates` and `acknowledgments`: letter or email, merge fields, sent record.
- `import_jobs`, `import_rows`, `import_mappings` (saved column maps per org).
- `duplicate_candidates`: pair of constituent ids, score, reasons, status (`open` | `merged` | `not_duplicate`).
- `merge_history`: surviving id, merged id, field decisions, reversible for 30 days.
- `integrations`: provider, status, encrypted credentials, last sync, config.
- `audit_log`.
- `dashboard_snapshots`: nightly rollups so the board dashboard loads instantly.

## 6. Feature specs

### 6.1 Guided gift entry (the SOP built in)

- During onboarding the org completes a short "Gift Entry Standards" setup: which fields are required, the fund/campaign/appeal lists, the default fund, naming conventions, who can post gifts, and whether gifts enter a batch for review before posting.
- The gift form enforces those standards. Required fields block save. The form shows the org's own instructions inline (a short text per field the admin can edit).
- Batch mode: staff enter gifts into a dated batch; an admin reviews totals against the deposit and posts the batch. Posting locks the gifts and writes to the audit log. This mirrors how a bookkeeper reconciles.
- On constituent selection, the form surfaces possible matches before a new record can be created.
- Every posted gift shows up in the acknowledgment queue until acknowledged.
- A printable "Gift Entry Standards" page is generated from the config, so the org has documentation it never had to write.

### 6.2 Duplicate detection and merge

- On create and on import, score candidate matches using normalized name, email, phone, and address (pg_trgm similarity with weighted rules). Show matches with the reasons.
- A Duplicates queue lists open candidates sorted by score. Merge UI shows both records side by side with per-field radio buttons; gifts, interactions and relationships always move to the survivor.
- Merges are reversible for 30 days.
- Data Health panel: counts of open duplicates, constituents missing email and address, gifts missing a fund, unacknowledged gifts older than 14 days, stale records (no gift or interaction in 36 months). Each count links to a filtered list.

### 6.3 Import wizard

- Accepts CSV and XLSX. Step 1 upload, step 2 map columns (with auto-suggest and saved mappings per org), step 3 validate (show errors per row, allow fix-in-place or skip), step 4 duplicate review (rows that match existing constituents can be merged into, created new, or skipped), step 5 commit.
- Two import types: constituents only, and constituents plus gift history (one gift per row with constituent columns repeated, the way most spreadsheets look).
- Every import is a job with progress, a summary, and a one-click rollback that removes everything it created.
- Ship starter mappings for common exports: a generic spreadsheet, Little Green Light, Bloomerang, Zeffy, Givebutter, and a Stripe payments export.

### 6.4 Board dashboard and reports

- One-page dashboard, nightly snapshot plus on-demand refresh: donors YTD vs prior YTD, dollars YTD vs prior YTD, median and average gift, new vs repeat donors, overall retention, first-time donor retention, repeat donor retention, revenue by fund and by campaign, top 10 gifts, lapsed donors (13 to 15 months since last gift) with a one-click export of that list.
- Use the Fundraising Effectiveness Project definitions for retention so the numbers are comparable to published benchmarks. Document each definition in a tooltip.
- Shareable read-only link for board members (role `board_viewer`, no PII beyond donor names, with an org-level toggle to hide names entirely).
- Print and PDF layout.
- Saved reports: a small library of common lists (LYBUNT, SYBUNT, gifts by date range, gifts by fund, donors by campaign, unacknowledged gifts) with filters and CSV export. No custom report builder in v1.

### 6.5 Acknowledgments and year-end statements

- Templates with merge fields for letters (print-ready PDF) and emails (via Resend). Default templates ship with the required IRS substantiation language (no goods or services provided, or the description and good-faith value when they were).
- Acknowledgment queue with bulk send and bulk mark-as-sent.
- Annual giving statements for every donor, generated as PDFs in bulk each January, with the deductible amount per gift. This matters more from tax year 2026 because of the new non-itemizer deduction.

### 6.6 Integrations

- Stripe: hosted donation page and embeddable form per org, one-time and monthly, with fund selection and optional cover-the-fees. Webhooks create gifts automatically (source `stripe`, matched or new constituent with the same duplicate rules). Payouts appear as suggested deposit batches.
- Mailchimp: one-way sync of constituents and tags to an audience, with opt-out flags respected. Two-way later.
- QuickBooks Online: v1 is a deposit summary export (CSV by batch, by fund, mapped to the org's income accounts). API sync is v2.
- Integration health visible on the Data Health panel (last sync, errors).

### 6.7 Onboarding and continuity

- Guided setup in under 30 minutes: org profile, fiscal year, funds and campaigns, gift entry standards, first import, invite team.
- Sample organization seeded in every new account (clearly labeled) so people can click around before they import.
- Account continuity page: who owns the account, how to transfer it, how to export everything, and what happens if the subscription lapses (read-only access for 90 days, exports always available).

## 7. Build phases with acceptance criteria

Each phase ends with passing tests, a seeded demo org, and a short `docs/` page describing what was built and how to use it.

Phase 0: Foundation
- Repo scaffold, Supabase project, Drizzle migrations, auth (email magic link plus password), org creation, memberships and roles, RLS policies and the cross-tenant isolation test suite, Stripe Billing skeleton with a free trial, Sentry.
- Done when: two orgs exist, a user in one cannot see the other through any API route, and a new signup lands in an empty org with the sample org toggle available.

Phase 1: Constituents and gifts
- Constituent CRUD, search, relationships, interactions, tags. Funds, campaigns, appeals. Gift entry standards config, guided gift form, batches and posting, audit log.
- Done when: a staff user can enter a batch of 20 gifts against the org's required fields, an admin can post it, and the audit log shows every change.

Phase 2: Clean data
- Duplicate scoring on create, Duplicates queue, side-by-side merge with reversal, Data Health panel.
- Done when: importing a deliberately messy fixture yields the expected candidates, a merge moves all gifts, and the reversal restores both records.

Phase 3: Import wizard
- Five-step wizard, saved mappings, validation, duplicate review, commit, rollback, starter mappings.
- Done when: a 5,000-row spreadsheet of constituents plus gifts imports in under two minutes with duplicate review, and rollback removes every created row.

Phase 4: Dashboard, reports, acknowledgments
- Nightly snapshot job, dashboard page, board share link, saved reports with CSV export, acknowledgment templates and queue, annual statements.
- Done when: the dashboard numbers for the fixture org match a hand-calculated spreadsheet, and a bulk acknowledgment run produces correct PDFs and emails.

Phase 5: Integrations
- Stripe donation page and webhooks, Mailchimp one-way sync, QuickBooks deposit export, integration health.
- Done when: a test donation creates a gift matched to an existing constituent, the Mailchimp audience reflects tags within one sync cycle, and the QBO export reconciles to posted batches.

Phase 6: Launch readiness
- Billing tiers live, onboarding flow, continuity page, help docs, accessibility audit, load test with 50 orgs of 10,000 constituents, backup and restore drill.

## 8. Working conventions for Claude Code

Put these in `CLAUDE.md` at the repo root.

- Read this brief and `docs/` before starting any task. Ask before changing the data model.
- Every schema change is a Drizzle migration with a rollback. Never edit a migration that has been applied.
- Every tenant-scoped query runs under RLS; write the isolation test before the feature.
- No feature is done without a seed update for the sample org and a `docs/` note.
- Accessibility is part of the definition of done: label every input, test keyboard flow on every form.
- Keep PII out of logs, test fixtures that get committed, and error messages.
- Prefer boring, well-documented libraries over clever ones. This product will be maintained by one person.
- Commit small. Open a PR per phase milestone with a checklist against the acceptance criteria above.
- Writing in the UI and docs: plain language, short sentences, no jargon a volunteer treasurer would not know. No em dashes.

Suggested first prompt to Claude Code:

> Read lite-donor-crm-build-brief.md. Propose a repo structure and the Phase 0 task list, including the RLS policy design and the cross-tenant isolation test plan, before writing any code. Flag any place where you would deviate from the recommended stack and why.

## 9. Decisions still needed from Jenn

- Product name and domain.
- Pricing tiers (recommendation: a single flat monthly price with a 30-day free trial, and a lower "under 500 constituents" tier if we want a low entry point; no per-contact pricing).
- Whether to offer a Noble Maple done-for-you migration service as an add-on at launch (natural fit with the Database Management Plan).
- Which starter import mappings to prioritize (the list in 6.3 is a guess at the most common exits).
- Whether board_viewer should see donor names by default or only aggregates.
- Data residency: US-only Supabase region is assumed.

## 10. Research references behind the thesis

Summarized in the companion report "Nonprofit leader pain points 2026" (same folder). Key figures worth repeating in marketing copy: FEP full-year 2025 donor count down 3.6% (fifth straight annual decline) and first-time donor retention of 18.9%; NFF 2025 found 36% of nonprofits ran a deficit; Virtuous/Fundraising.AI found 92% of orgs use AI while 47% have no policy; NTEN 2025 found more than 40% of orgs say fewer than 10% of staff can build a report. Source links are in that report.
