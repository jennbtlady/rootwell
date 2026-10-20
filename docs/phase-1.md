# Phase 1: Constituents and gifts

Status: in progress. Started 2026-10-20 on branch `phase-1/constituents-and-gifts`.

Done: every task. Components: Table, Tabs, Modal, Combobox, Checkbox, Radio, Pagination,
Skeleton, Empty state, Toast. Playwright runs the acceptance flow end to end with WCAG 2.1
AA scans (axe) on each screen, on desktop and at phone width: `pnpm --filter @maple/web e2e`
against a running dev server, or the CI job, which builds and starts the app itself.
What is left is polish from real use.

## Testing while signed in without an authenticator

`MFA_ENFORCEMENT=off` in `apps/web/.env.local` (see the README) turns off two-step
enforcement locally. Playwright sets it for the server it starts.

## Verified by hand on 2026-10-20

In the sample organization: the seeded list of 41 constituents, search, the batch list
with two years of posted batches, entering a gift through the donor search, the standards
refusing a gift with "Campaign is required here" and "Enter the check number" under the
fields, posting refused with "batch total 375.00 does not match the expected total
350.00", and posting succeeding once the extra gift was removed, which locked the batch.

Brief: constituent CRUD, search, relationships, interactions, tags. Funds, campaigns,
appeals. Gift entry standards, guided gift form, batches and posting, audit log.

Done when: a staff user can enter a batch of 20 gifts against the org's required fields,
an admin can post it, and the audit log shows every change.

## Task list

1. Data model and RLS: every table below, policies, audit triggers, name and search
   helpers, the duplicate scorer, the batch posting function, and tests.
2. Core: Zod schemas, the gift entry standards engine, services for every entity.
3. API routes for everything in 2, with route-matrix tests.
4. Components to port from Paste: Table, Tabs, Modal, Combobox, Checkbox, Radio,
   Toast, Empty state, Pagination, Skeleton.
5. Screens, phone first: org navigation; constituent list and search; constituent
   profile (giving summary, gifts, interactions, relationships, tags); constituent
   form with the duplicate check; log an interaction; funds, campaigns and appeals;
   gift entry standards; batches; gift entry inside a batch; posting; audit trail.
6. Sample org seed: funds, campaigns, appeals, 40 constituents, two years of gifts.
7. Playwright with the acceptance flow above.

## Data model

Every table carries `org_id`, `created_at`, `updated_at`, `created_by`, `updated_by`,
RLS and the audit trigger. Board viewers see none of these tables.

| Table | Notes |
|---|---|
| `funds`, `campaigns`, `appeals` | Name, code, active, date range. Appeals belong to a campaign. |
| `constituents` | `type` person, household or organization. `display_name` and `sort_name` are kept by a trigger. `custom_fields` is a small JSON bag. |
| `constituent_emails`, `constituent_phones`, `constituent_addresses` | One row per contact point, with a type and a primary flag. Phones keep a digits-only copy for matching. |
| `tags`, `constituent_tags` | Org-defined tags. |
| `relationships` | Constituent to constituent with a type and its reciprocal. |
| `interactions` | Calls, meetings, emails, notes with a date, a summary and an owner. |
| `batches` | A dated set of gifts entered together. `open` until an admin posts it. |
| `gifts` | The money. A posted gift is locked except for acknowledgment fields. |
| `recurring_plans`, `pledges` | Schedules. Payments are gifts that point at them. |

Deviation from the brief: the brief lists emails, phones and addresses as fields on the
constituent. They are child tables here so a donor can have several of each, which is
what import files and Stripe both produce.

## Helpers in the database

- `app.search_constituents(org, q)`: name, email and phone search with pg_trgm.
- `app.find_duplicates(org, first, last, email, phone, postal)`: scored candidates with
  reasons. Phase 2 builds the queue and merge on top of it.
- `app.post_batch(batch)`: checks totals, stamps every gift as posted, locks them.
