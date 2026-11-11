# Rate limits and the bot check

Launch review, must fix 3 (2026-11-11). Public pages and bulk email are now limited, and
public forms carry a bot check. This page says what is limited, where the code is, and what
to switch on when the hosted accounts exist.

## What is limited

| What | Counted by | Limit | Where |
|---|---|---|---|
| Starting a checkout on a giving page | Visitor | 10 per 10 minutes | `packages/api/src/routes/public-give.ts` |
| Starting a checkout on a giving page | Giving page | 100 per 10 minutes | same |
| Opening a board link | Visitor | 60 per minute | `apps/web/src/app/board/[token]/page.tsx` |
| Emailing thank-yous or year-end statements | Organization | 10 sends per hour | `packages/api/src/routes/reporting.ts` |

The numbers live in one place: `RATE_LIMITS` in `packages/core/src/services/rate-limits.ts`.
Over the limit, the API answers 429 with a `retry-after` header and the code
`rate_limited`, and people see "Too many tries in a short time. Please wait a few minutes
and try again." The board page shows the same sentence.

The per-page limit is the one that stops card testing spread across many addresses. If a
big event ever needs more than 100 gifts in 10 minutes on one page, raise it there.

## How it works

- Counts live in the database, in `rate_limit_hits` (migration `0013_launch_rate_limits`,
  function in `drizzle/custom/0015_rate_limits.sql`). On Vercel each request can land on a
  different server, so counts in memory would not add up.
- Fixed windows: the count starts again at the start of each window.
- Visitors are counted by a keyed hash of their IP address (HMAC from `INTEGRATIONS_KEY`).
  The database never holds an address.
- Nobody can read or write the table directly. RLS is on with no policies, and the only way
  in is `app.hit_rate_limit()`. The `app` schema is not exposed through Supabase's Data API,
  so a browser cannot call it.
- Bulk email counts only after the permission check, so someone outside an organization
  cannot use up its sends.
- pg_cron runs `app.prune_rate_limits()` every hour and deletes windows older than a day.

## The bot check (Cloudflare Turnstile)

On giving pages, sign in and sign up (`apps/web/src/components/bot-check.tsx`). It runs in
"interaction-only" mode: most people never see it, and it asks for a click only when
Cloudflare is unsure.

| Setting | Where | What it does |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Vercel | Shows the widget on the three forms |
| `TURNSTILE_SECRET_KEY` | Vercel | Our API checks giving page tokens with it |
| Same secret key | Hosted Supabase, Authentication, Bot and abuse protection | Supabase checks sign in and sign up tokens |

- **Without keys, outside production:** no widget, and the checks are skipped. Local
  development works as before.
- **Without `TURNSTILE_SECRET_KEY` in production:** giving pages refuse checkouts with
  "Online giving is paused for a moment," rather than run with no bot check.
- **Testing the real widget locally:** Cloudflare publishes test keys that always pass:
  - site key `1x00000000000000000000AA`
  - secret `1x0000000000000000000000000000000AA`

## To do when the hosted accounts exist (Jenn)

1. **Cloudflare:** create a free account and add a Turnstile widget for the app's domain.
   Put the two keys in Vercel.
2. **Hosted Supabase, Authentication:**
   - Turn on captcha, choose Turnstile, and paste the same secret key. The sign-in and
     sign-up forms already send the token, so nothing breaks.
   - Turn on "Confirm email".
   - Leave the built-in rate limits on: per address, sign in and sign up 30 per 5 minutes,
     link and code checks 30 per 5 minutes.
   - Set up custom SMTP (Resend), then set the email limit to suit, since the default is
     very low.
3. **Vercel firewall:** add a rate limit rule on `/api/v1/public/*` and `/board/*` as a
   second layer. Something like 60 requests per minute per address is generous for people
   and still stops floods before they reach the app.
4. **Stripe Radar:** with Standard accounts each nonprofit sets its own Radar rules in its
   own Stripe dashboard. Add this to the Stripe setup checklist for each organization.

## Tests

`packages/api/test/rate-limits.test.ts` covers:
- each limit, including that a visitor or page over its limit does not block others;
- that strangers cannot use up an organization's email sends;
- the bot check refusing a bad token;
- production pausing gifts without a key;
- signed-out visitors being unable to read the counts.

## Rollback

Drop `rate_limit_hits`, `app.hit_rate_limit` and `app.prune_rate_limits`, unschedule the
`rate-limits-prune` cron job, and revert the commit. The routes then run unlimited, as
before.
