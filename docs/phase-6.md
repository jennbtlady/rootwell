# Phase 6: Web launch readiness

Status: in progress. Started 2026-10-20 on branch `phase-6/launch-readiness`.

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
