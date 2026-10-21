# Phase 6: Web launch readiness

Status: built and tested, 2026-10-20, on branch `phase-6/launch-readiness`. Real Stripe
Billing keys, a hosted staging run of the load test, and the manual screen reader pass
are still to do (below).

Brief: billing tiers live, onboarding flow, continuity page, help docs, accessibility audit,
load test with 50 orgs of 10,000 constituents, backup and restore drill. Build plan adds a
mobile browser pass on iOS Safari and Android Chrome for every form.

## Decisions (Jenn, 2026-10-20)

- One flat monthly price with a 30-day free trial. The price lives in Stripe, so it can
  change without code. A smaller tier can be added later.
- Stripe Billing is built against a simulator now, like Phase 5. Real keys later.
- When a subscription lapses, the organization is read only for 90 days: every screen
  loads, nothing changes, exports and the continuity page keep working. Enforced in the
  database, not just the screens.
- The load test and the backup and restore drill run against local Supabase now, with
  scripts that point at a hosted project later.
- Embedded giving forms stay a future build (see phase-5.md).

## No new tables or columns

Billing uses the columns Phase 0 already added to `organizations`: `stripe_customer_id`,
`stripe_subscription_id`, `subscription_status`, `trial_ends_at`, `read_only_until`.

## What was built

| Brief item | Where | Status |
|---|---|---|
| Billing tiers live | Settings, Billing; `routes/billing.ts`; `integrations/billing.ts` | Built in test mode. One price, 30-day trial, Stripe Checkout and customer portal. |
| Lapsed accounts read only | `drizzle/custom/0009_billing.sql`; banner in the org layout | Built. Enforced by restrictive RLS policies. The API explains why. |
| Onboarding flow | Home, Get set up; `/setup` | Step list that ticks itself off. The guided walkthrough is a placeholder (`docs/placeholders.md`). |
| Continuity page | Settings, Account and export | Built: owner, admins, how to hand over, download everything, lapse policy. |
| Help docs | Help link in the top bar; `content/help.ts` | Eleven guides. Chat assistant is a placeholder. |
| Accessibility audit | `docs/accessibility-audit.md` | Done; automated checks added; manual screen reader pass still to do. |
| Mobile browser pass | `e2e/mobile-forms.spec.ts` | Every form on iPhone Safari and Android Chrome. |
| Load test | `packages/api/scripts/load-test.ts`; `docs/load-test.md` | Done on 500,000 donors. Found and fixed a crash and three slow paths. |
| Backup and restore drill | `packages/db/scripts/backup-drill.ts`; `docs/backup-restore.md` | Passed on the 500,000-donor database: backup 13 s, restore 29 s, everything matched. |

Also this phase, at Jenn's request:
- The navigation redesign to `docs/navigation-standard.md` (map in `docs/navigation.md`).
- Placeholders for the setup walkthrough, the chat assistant, and dashboard customization.
- The clickjacking fix (framing refused, from the end of Phase 5).

## Billing in detail

- **New organizations** start `trialing` with `trial_ends_at` 30 days out. The sample
  organization never needs a subscription.
- **Who can act:** only the owner, with two-step sign-in, can start or manage a
  subscription. Admins see the status.
- **Subscribing:** "Subscribe" opens Stripe Checkout. Trial days left carry over, as long as
  more than 48 hours remain, which is Stripe's rule. "Manage billing" opens Stripe's
  customer portal to change the card, see receipts, or cancel.
- **Billing webhook:** `POST /api/v1/webhooks/stripe-billing`. The signature is checked
  first. The organization comes from metadata we set at checkout. Each event is stored
  once.
- **Who can access what, by status:**
  - Active, or past due while Stripe retries the card: full access.
  - Trialing: full access until the trial ends.
  - Canceled, unpaid, or a trial that ended without a subscription: read only.
- **The read-only window:** `read_only_until` is set 90 days out the first time an account
  lapses, and cleared when it comes back. After 90 days the account stays read only. After
  12 months with no team activity, it is deleted, following notices to the whole team
  (`docs/lapsed-accounts.md`).
- **What still works while read only:**
  - Every read.
  - Exports.
  - Team changes and transferring ownership.
  - Billing.
  - Board links.
  - Integration settings.
  - Stripe gifts already paid, which the system actor still records.
  - The giving page stays up but stops offering card payment.
- **The billing lock:** a trigger refuses changes to the billing columns and the sample
  flag unless the billing system makes them. Owners cannot mark their own account paid
  through Supabase's direct database API.

### Real keys checklist

1. In the Noble Maple Stripe account, make a Product with one monthly Price. Put its id in
   `STRIPE_PRICE_ID_STANDARD`.
2. Turn on the customer portal: allow card updates, invoices, and cancel at period end.
3. Add a webhook endpoint `https://<app>/api/v1/webhooks/stripe-billing` with
   `checkout.session.completed` and `customer.subscription.created`, `.updated`, `.deleted`.
   Put its secret in `STRIPE_WEBHOOK_SECRET`. This is a different endpoint and secret from
   the Connect one.
4. Set `STRIPE_SECRET_KEY`. Test with card 4242 4242 4242 4242, then a failing card such as
   4000 0000 0000 0341, to see past due and then unpaid.

## Rollback

Migration `0011_phase6_import_options`: drop `import_jobs.options`, then restore
`app.commit_import` and the "similar name" wording from git history (`0005_dedupe.sql`,
`0006_imports.sql`). Gifts already imported keep their "before import" thank-you.

Migration `0010_phase6_statement_sends`: drop `statement_sends` and remove
`drizzle/custom/0012_statement_sends.sql`. The statements page goes back to emailing
everyone on each click.


Migration `0009_phase6_lapsed_accounts` (lapsed accounts): drop `deleted_organizations` and the
four `organizations.lapse_*`/`last_activity_at` columns, then remove `0011_lapsed_accounts.sql`'s
functions. The `scheduler` enum value can stay; Postgres cannot drop an enum value without
rebuilding the type.


For the billing and performance SQL:

- **0009_billing.sql:**
  - Drop the `*_writable_*` policies, the `guard_billing_columns` trigger, and
    `app.org_writable`.
  - Restore `app.create_organization` and `app.public_donation_page` from 0001 and 0008.
- **0098_rls_performance.sql:** re-run the policy files 0001 to 0009, which recreate the
  readable policy forms, and drop `app.org_ids_with_role` and `app.writable_org_ids`.
- **0010_scale.sql:** re-run 0005 and 0006, which restore the person-by-person scan and
  the SQL version of `app.candidate_partners`.

## Sample organization

No seed change was needed for billing or setup. The sample organization is exempt from
billing, and setup steps are not shown for it. The Phase 5 seed already gives it a giving
page and QuickBooks names for the new screens to show.

## Still to do before launch

- **Stripe Billing:** real keys (checklist above).
- **Load test:** rerun on a hosted staging Supabase project.
- **Weekly backup:** set up the weekly `pg_dump` job once the hosted project exists.
- **Accessibility:** the manual screen reader and 200% zoom pass in
  `docs/accessibility-audit.md`.
- **Background jobs:** move the whole-organization duplicate scan and Download everything
  to background jobs (Inngest) before any customer passes about 25,000 donors.
- **Phase 0 leftovers:**
  - Sentry is wired in and scrubbed (below). It only needs a project's DSN.
  - The icons are done.
  - Vercel still needs the account.
- **Decided (Jenn, 2026-10-20):**
  - Dashboard customization starts with one layout per organization.
  - Lapsed accounts stay read only after the 90 days. Nothing is deleted.
  - After 12 months with no activity, a lapsed account is deleted. The whole team gets
    emails at 60, 30, and 7 days first. Built; see `docs/lapsed-accounts.md`.

## Error reporting (Sentry)

- **When it runs:** it is off unless `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN`
  (browser) are set. Local development and tests send nothing.
- **What it never collects, at the source:** user info, cookies, request bodies, web address
  queries, and response headers. Request headers are limited to user-agent and
  content-type.
- **Second layer:** every event passes `apps/web/src/lib/sentry-scrub.ts`, which drops extra
  context and console breadcrumbs, and blanks email addresses, phone numbers, card-like
  numbers, and street addresses in any text that is left. It is tested in
  `apps/web/test/sentry-scrub.test.ts`.
- **API errors:** the API answers its own errors with plain messages. Unexpected ones are
  reported through `setErrorReporter`, with ids in the path replaced by `:id`. Expected
  refusals, such as permission or read-only, are not reported.
- **No session replay.** It would record donor details on screen.
- **Source maps:** not uploaded yet. That needs `withSentryConfig` and a Sentry auth token,
  once the account exists.

## Icons

- The source is `apps/web/public/icon.svg`: a white maple leaf on the brand maple brown. It
  has no text, because the product name is not final.
- Generated from it:
  - `icon-192.png` and `icon-512.png`.
  - `icon-maskable-512.png`, with extra margin for phone home screens that crop to a
    circle.
  - `app/apple-icon.png`, for iPhone home screens.
  - `app/icon.svg`, the browser tab icon. It replaces the Next.js placeholder.
- To change the icon, edit `icon.svg` and `icon-maskable.svg`, then re-render the PNGs at
  the same sizes.

## Dana's trust fixes (2026-10-21)

From the persona walkthroughs.

- **The dashboard updates when gifts are posted.** `postBatch`, `commitImport` and
  `rollbackImport` call `app.refresh_dashboard` in the same transaction.
- **Year-end statements go out once.**
  - The `statement_sends` table (approved by Jenn) holds one row per donor, tax year and
    channel.
  - RLS is the same as other donor data: staff read, and owners and admins write. Lapsed
    accounts are read only.
  - A merged-away donor's rows are removed with them.
  - The sample organization needs no seed change: statements not yet sent is the realistic
    starting state.
- **Deposit mismatches are explained in dollars.**
  - The batch page shows the difference, and an in-app dialog appears before posting.
  - `app.post_batch` raises plain-language messages.
- **Smaller fixes:**
  - Printed statements no longer say "Reply to the email it came with".
  - Date and time text is identical on the server and in the browser, which fixes a
    re-render warning on Board sharing.
- **Tests:**
  - `apps/web/e2e/phase-6-dana-trust.spec.ts`.
  - The statements case in `packages/api/test/reporting.test.ts`.
  - The updated posting step in `phase-1-acceptance.spec.ts`.

## Ruth's fixes (2026-10-21)

From the persona walkthroughs. Ruth is the board treasurer who checks the board link.

- **The spreadsheet matches the board page.**
  - Gifts by date and Gifts by fund start at the fiscal year start when no date is
    chosen. They used to start on January 1.
  - The report states its dates, and the filters show the dates it used.
  - The download's file name includes the dates, for example
    `gifts-by-fund-2026-07-01-to-2026-10-21.csv`.
  - The total row has gift and donor counts. A donor who gave to two funds counts once.
- **Explanations a treasurer can read.**
  - Each one starts with a plain sentence. The Fundraising Effectiveness Project is named
    last.
  - The period reads "comparing fiscal years 2024 and 2025".
  - On a phone, a tap elsewhere or Escape closes the box. Only one is open at a time.
    Each button is 44px.
  - On paper, the board dashboard prints them as notes at the end.
- **The board link says who can see it.** A line says anyone with the link can see the
  page, and whether donor names are hidden. A turned-off link shows a short page that
  explains this, still with a 404 status.
- **Wording and layout.**
  - Readable dates.
  - The fiscal year start is stated.
  - Cards say "this fiscal year".
  - "0 / 17" reads "0 new and 17 returning".
  - Fund rows and Largest gifts wrap at large text sizes instead of running off the card.
  - Print is a full-size button.
- **Seed change.** The sample organization now has three years of gifts, and its donors
  drift: some stop giving and new ones start. Retention used to show 100%. It now shows
  about 65%. This only affects newly created sample organizations. It is a hand-written
  function in `0004_sample_seed.sql`, so there is no table change and nothing to roll
  back.
- **Tests:**
  - `apps/web/e2e/phase-6-ruth.spec.ts`.
  - The report range and total row checks in `packages/api/test/reporting.test.ts`.
  - The updated wording in `phase-4-reporting.spec.ts`.

## Marcus's fixes (2026-10-21)

From the persona walkthroughs. Marcus is the development associate who imports the old
donor list and pulls lists for mailings.

- **The import asks two questions before it runs.** They are on the last step, "Import".
  - "Were these gifts already thanked in your old system?" Yes is the default, for gifts
    more than 30 days old, and the date can be changed. Those gifts are recorded as thanked
    on their gift date, with the method `before_import`. They stay out of Thank-yous and
    out of the Data health unthanked count.
  - "Which of your funds and campaigns do these mean?" Each name in the file is matched to
    an existing fund, campaign or appeal. Same name or code is an exact match. If exactly
    one existing name shares its words, that is suggested and marked "Close match, please
    check". Otherwise the choice is "Add as a new fund". The logic is `suggestCoding` in
    `packages/core/src/import/coding.ts`.
  - The answers are sent with the import request and saved in the new
    `import_jobs.options` column (approved by Jenn). `app.commit_import` reads them.
  - `GET /orgs/:orgId/imports/:id/coding` lists the names and suggestions. `POST .../commit`
    takes an optional `{ options }` body. An empty body keeps the old behavior.
- **Review matches gives enough to decide.** Identical names say "Same name", not "similar
  name", and the percentage is gone. Each card shows the existing record's email, phone,
  address, gift count and last gift date.
- **Past imports are easy to find.** They are linked from the donor list, the import page
  and Data health. The list is titled "Past imports" and says which imports can be undone.
  The rollback message now counts the funds and campaigns it removed.
- **Gifts not yet posted.** Thank-yous says how many gifts wait in unposted batches, with a
  link. The "gave last year, not this year" list leaves out anyone who gave this year, even
  if the gift is not posted yet.
- **People lists work for a mailing.** The downloads of the gave last year, gave before and
  lapsed lists add first name, last name, organization, address lines, city, state, ZIP
  and "Do not mail". These columns are marked `fileOnly`, so the on-screen table stays
  narrow.
- **Sample organization:** no seed change. Its open batch already shows the Thank-yous
  note, and the import questions appear on any import.
- **Tests:**
  - `apps/web/e2e/phase-6-marcus.spec.ts`.
  - The import questions, "Past imports" link and 375px check in `phase-3-import.spec.ts`.
  - The import choices case in `packages/api/test/imports.test.ts`, the mailing columns in
    `reporting.test.ts`, and a route-matrix entry for the coding route.
  - `suggestCoding` cases in `packages/core/test/import.test.ts`.

## Dana's gift form fixes (2026-10-21)

From the persona walkthroughs.

- **Edit a gift in an open batch (D-d).**
  - Each gift in an open batch has Edit, next to Remove.
  - The entry form loads that gift, with "Save changes" and "Cancel editing", and the row
    shows "Editing above".
  - It uses the existing `PATCH /orgs/:orgId/gifts/:id`, so the gift entry rules still
    apply. Posted gifts stay locked by the database.
- **Adding a donor from the gift form.**
  - The link reads "Add "name" as a new donor" and opens
    `/constituents/new?batch=...&name=...`.
  - The name fills first and last name. Saving, or choosing an existing match, goes back to
    the batch with that donor chosen.
- **A second look at likely duplicates.** When a new donor matches someone with a score of
  0.9 or more (same email, or same name and ZIP), "Add donor" first asks "Is this X?"
  with "Use X" or "No, this is someone else". The live warning moved below the email and
  phone fields, so the field being typed in does not jump.
- **Wording.**
  - A required campaign starts on "Choose a campaign", not "None".
  - The sample organization's Campaign hint no longer mentions appeals. This applies to
    sample organizations created from now on.
  - The donor page's yearly totals use the fiscal year (D-e).
- **Duplicate reasons.** "Same name" is used when names are identical (from Marcus's fixes).
- **No schema change.** The seed change is text only.
- **Tests:** `apps/web/e2e/phase-6-dana-gift-form.spec.ts`. It also checks that the field
  being typed in stays above the phone tab bar (D-f).

## Smaller walkthrough fixes (2026-10-21)

Every remaining Minor finding in the walkthrough report is now fixed or confirmed fixed.

- **In-app confirm.**
  - `useConfirm()` and `ConfirmHost` (`components/ui/confirm.tsx`) replace all 16 uses of
    the browser's `confirm()`.
  - The buttons name the action. Focus starts on the safe choice.
  - Browser tests use `confirmIn(page, "Remove gift")` from `e2e/helpers.ts`.
- **Copy link.** `CopyButton` says "Copied" on itself.
- **Landing page.** It says who the product is for and offers "Start your free 30-day
  trial", with no card needed. Sign in is a link.
- **Welcome.** After sign-up the page says "Welcome, first name". The header shows the
  person's name instead of their email.
- **Time zones.** Create organization uses the same plain names as the details screen.
- **After posting.** A posted batch shows "Next: thank these donors" until every gift in
  it is thanked.
- **Grammar.** `plural()` in `lib/format.ts`.
- **One name each.**
  - The Donors tab "Clean up" is now "Data health".
  - The Reports tab "Reports" is now "Lists and downloads".
  - "Gift entry standards" is now "Gift entry rules".
- **Merging.** The page shows "Keeping" and "Merging in", with the date each was added and
  its gift count.
- **Imports.**
  - The last step lists rows with warnings, with Skip for each.
  - New warnings: a lone name with no other details, and possibly day-first dates
    (`flagDayFirstDates` in `packages/core/src/import/map.ts`).
- **Thank-you preview.** Previous and Next step through every selected gift.
- **Data health.** One line says what needs attention and where to start. Problems are
  listed first.
- **Board sharing.** "Share with your board" is on the Board dashboard for owners and
  admins.
- **No schema or seed change.**
- **Tests:**
  - `e2e/phase-6-polish.spec.ts`.
  - Additions to the import, reporting, Dana trust and setup wizard specs.
  - Import warning cases in `packages/core/test/import.test.ts`.
