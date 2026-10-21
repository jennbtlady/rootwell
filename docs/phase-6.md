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
  lapses, and cleared when it comes back. After 90 days the account stays read only
  (Jenn, 2026-10-20). Deleting long-inactive accounts is being considered; see
  `docs/lapsed-accounts.md`.
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

There is no Drizzle migration this phase. To roll back:

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
- **Phase 0 leftovers that need accounts:** Sentry, icons, and Vercel.
- **Decided (Jenn, 2026-10-20):**
  - Dashboard customization starts with one layout per organization.
  - Lapsed accounts stay read only after the 90 days. Nothing is deleted.
- **Under consideration:** deleting an account after a long stretch with no activity.
  The assessment is in `docs/lapsed-accounts.md`. Nothing is built for it.
