# Phase 5: Integrations

Status: built and tested against simulators, 2026-10-20, on branch `phase-5/integrations`.
Real Stripe and Mailchimp keys are still to come (checklist at the end).

Brief: Stripe donation page and webhooks, Mailchimp one-way sync, QuickBooks deposit export,
integration health.

Done when: a test donation creates a gift matched to an existing constituent, the Mailchimp
audience reflects tags within one sync cycle, and the QuickBooks export reconciles to
posted batches.

## Decisions (Jenn, 2026-10-20)

- Gifts gain `fee_amount`, `net_amount`, `fee_covered_amount` and `source_platform`.
- Stripe Connect (Standard accounts, OAuth). Money goes to the nonprofit's own account; we
  never hold their keys. Noble Maple needs a Stripe platform account.
- Build and test against simulators now; real test-mode keys later (checklist below).

## Smaller data model additions this phase needed

- `funds.income_account`: the QuickBooks income account each fund posts to.
- `organizations.accounting`: the deposit account and fee account names for the export.
- `batches.external_source` and `external_id`: a Stripe payout becomes one suggested batch.
- New tables: `integrations` (one per provider per org; credentials encrypted with
  AES-256-GCM using `INTEGRATIONS_KEY`, never logged, never returned by the API),
  `webhook_events` (idempotency and an error trail), `donation_pages`.

## How a Stripe gift flows

1. A donor opens `/give/{slug}`, picks an amount, once or monthly, a fund, and whether to
   cover the fee, then goes to Stripe Checkout on the nonprofit's connected account.
2. Stripe sends `checkout.session.completed` (and `invoice.paid` for each monthly gift)
   to `/api/v1/webhooks/stripe`. The signature is verified, the event is stored once, and
   a gift is created with gross, fee, net and covered fee, matched to an existing
   constituent by the same rules as the duplicate queue, or a new one is created.
   Online gifts start unposted and outside any batch.
3. When Stripe pays out (`payout.paid`), the gifts in that payout become one suggested
   batch, with the expected total set, for an admin to review and post like any other.
4. Refunds are not applied to locked gifts; they appear on Data Health as an item to
   handle in the books.

## Mailchimp

One-way. The owner pastes an API key and picks an audience. "Sync now" pushes every
constituent with an email who is not marked do-not-email, do-not-contact or deceased, with
their tags. New contacts are added as subscribed only when the admin confirms they have
permission; otherwise as transactional. Existing Mailchimp statuses are never changed,
except that people marked do-not-email here are unsubscribed there.

## QuickBooks

Two downloads per posted batch or date range: a deposit summary (one row per batch, with
the gift total, fees and the deposit) and a journal entry file in QuickBooks Online's import
format (credits to each fund's income account, debits to the deposit account and the fee
account). Credits always equal debits, and the totals equal the posted batches.

In-kind gifts, soft credits and pledges are left out of both files because no money moved.
Account names come from Settings, Integrations, QuickBooks, and from each fund's
"QuickBooks income account". Blank names fall back to Checking, Bank and payment fees, and
Contributions. Dates are written MM/DD/YYYY because QuickBooks US imports expect that.

## Where things are

- Screens: Settings, Integrations (Stripe, Mailchimp, QuickBooks); Settings, Giving pages;
  the public page `/give/{slug}` and `/give/{slug}/thanks`; Data Health, Integrations;
  QuickBooks buttons on a posted batch; the income account on each fund.
- Core: `services/online.ts` (donor match, gift, monthly plan, payout batch, webhook log),
  `services/integrations.ts` (settings, pages, Mailchimp contact list, export data, health),
  `accounting.ts` (journal lines and CSVs), `fees.ts` (the cover-the-fee formula).
- API: `routes/webhooks.ts`, `routes/public-give.ts`, `routes/stripe-sim.ts`,
  `routes/integrations.ts`; Stripe and Mailchimp clients and their simulators in
  `packages/api/src/integrations/`.
- SQL: `drizzle/0008_phase5_integrations.sql` and `drizzle/custom/0008_integrations.sql`.

## Security notes

- The webhook route has no sign-in. Stripe's signature is the proof, checked on the raw
  body. The event's account id is then mapped to an org by
  `app.org_for_integration_account`, which only signed-out callers may run. All writes run
  as the system actor for that one org, through RLS.
- Every event is stored once (`webhook_events`, unique per provider and event id). A
  replay returns `{ duplicate: true }`. A failed event is left unprocessed with its error
  so Stripe's retry runs it again, and it shows on Data Health.
- Gifts are keyed by the Stripe charge id, and monthly plans by the subscription id, under
  an advisory lock, so two copies of an event make one gift.
- Checkout metadata carries the org id. If it does not match the account's org, the event
  is refused and flagged.
- The fee and the total are computed on the server. The donor's browser only sends an
  amount, once or monthly, a fund from the page, and whether to cover the fee.
- Signed-in people cannot read `integrations.credentials`, even owners. The server reads
  them through `app.integration_credentials`, which allows owners, admins and that org's
  system actor. Mailchimp keys are encrypted with AES-256-GCM. Stripe needs no stored key:
  Connect calls use our platform key with the connected account id.
- The OAuth `state` is signed and expires in 10 minutes, and it names the org and the
  person who started the connection.
- Stored webhook payloads keep ids and types only, no donor contact details.

## Test mode (the simulators)

When `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID` and `STRIPE_CONNECT_WEBHOOK_SECRET`
are not all set, the app uses a built-in Stripe stand-in. It shows "Test mode" on every
screen it touches. Its connect and checkout pages live under `/api/v1/stripe-sim/`, it
charges the nonprofit rate (2.2% plus 30 cents), and it sends events signed with Stripe's
real scheme to our real webhook route. Integrations has a "Make a test deposit" button that
pays out everything not yet paid out. In production without keys the app refuses to start
Stripe, unless `STRIPE_MODE=simulated` is set on purpose.

Mailchimp keys that start with `sim-` (for example `sim-key-us1`) use an in-memory
Mailchimp with two audiences, Newsletter and Donors. Outside production only.

## Tests

- `packages/api/test/integrations.test.ts`: connect (owner only, signed state, no open
  redirect), giving page privacy, a donation matched to an existing donor with gross, fee,
  net and covered fee, replay and forged signatures, monthly plan and gifts and cancel,
  payout batch that posts, the QuickBooks journal balancing and matching posted batches,
  refund flagged and cleared, Mailchimp tags after one sync with opt-outs kept, disconnect.
- `packages/api/test/routes.test.ts`: every new org route in the cross-org matrix.
- `packages/db/test/privileges.test.ts`: who can read credentials, map accounts, and write
  webhook rows.
- `packages/core/test/accounting.test.ts`: journal math, CSV formula defusing, names.
- `apps/web/e2e/phase-5-giving.spec.ts`: connect, make a page, give signed out, see the
  gift on the new donor, Data Health, accessibility scans, 375px width.

## Not done yet, on purpose

- Mailchimp sync runs when someone presses "Sync now". A nightly run can be added with
  Inngest later; the code is ready for it (it would run as the system actor).
- No rate limit on the public checkout route yet. Add one before launch (Vercel firewall
  or a small token bucket).
- Refunds are flagged, not applied. Someone decides whether to delete or adjust the gift.
- Stripe Billing for our own subscription is still the Phase 0 task 9 item.
- Embedding a giving page in a nonprofit's own website is a future build (Jenn,
  2026-10-20). Today they link to `/give/{slug}`. Stripe Checkout will not load inside a
  frame, so an embed needs either checkout opening in the full window or Stripe's embedded
  checkout. Plan: allow framing on `/give/*` only, an embed layout that resizes itself, and
  a "Copy embed code" box on each giving page.

## Rollback

Migration `0008_phase5_integrations` only adds: three tables, four gift columns, two batch
columns, `funds.income_account` and `organizations.accounting`. To roll back, drop the
`donation_pages`, `webhook_events` and `integrations` tables, the two new enums, and the
added columns, then remove the `0008` custom SQL functions
(`app.integration_credentials`, `app.org_for_integration_account`,
`app.public_donation_page`, `app.resolve_webhook_event`). No existing data changes.

## Real keys checklist

1. Make a Stripe platform account for Noble Maple. Turn on Connect, Standard accounts.
2. In Connect settings, add the redirect URL `https://<app>/app/stripe-return` (one per
   environment: production, preview, local) and copy the client id into
   `STRIPE_CONNECT_CLIENT_ID`. The organization travels in the signed `state`, so one
   fixed address serves every organization.
3. Add a webhook endpoint `https://<app>/api/v1/webhooks/stripe`, "Events on connected
   accounts", with: `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.deleted`, `charge.refunded`, `payout.paid`,
   `account.application.deauthorized`. Copy its signing secret into
   `STRIPE_CONNECT_WEBHOOK_SECRET`.
4. Set `STRIPE_SECRET_KEY` (test mode first) and `INTEGRATIONS_KEY` in Vercel.
5. Run the acceptance flow by hand in test mode with card 4242 4242 4242 4242, then with
   the Stripe CLI: `stripe trigger payout.paid --stripe-account acct_...`.
6. Apply for Stripe's nonprofit pricing on the platform account.
7. Mailchimp needs no app registration for API keys. Try a real key on a test audience.
