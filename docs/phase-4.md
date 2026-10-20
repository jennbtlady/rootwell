# Phase 4: Dashboard, reports, acknowledgments

Status: done on 2026-10-20, branch `phase-4/dashboard-reports-acks`.

## Acceptance

- `packages/db/test/dashboard.test.ts`: a fixture organization with a July fiscal year and
  gifts across four years, including soft credits, pledges, unposted gifts and a gift
  after the as-of date that must not count. Every dashboard number is recalculated in
  plain TypeScript from the same list, the way a person would in a spreadsheet, and must
  match the database exactly.
- `packages/api/test/reporting.test.ts`: a bulk thank-you run to three donors (a plain
  gift, a gala ticket with goods received, a donor who asked for no email). The emails
  and the text of every PDF page are read back and checked, including the IRS wording.
  Year-end statements are checked the same way.
- `apps/web/e2e/phase-4-reporting.spec.ts`: the same in the browser, with real email
  delivered to the local mail catcher and the letter PDF read back.

## Nightly job

`pg_cron` runs `app.refresh_all_dashboards()` at 07:00 UTC. Opening the dashboard also
computes today's numbers if the night's run has not happened, and "Refresh now" recomputes.

## Security fix found during this phase

Postgres lets every role execute a new function unless told otherwise. The sample-data
seeding function had no permission check of its own, so a signed-in user could have
called it on another organization. `drizzle/custom/0099_function_privileges.sql` now
revokes default execute on every `app` function, grants it back to signed-in users,
withholds the internal ones, and lets signed-out visitors call only the board link
function. `packages/db/test/privileges.test.ts` guards it.

Brief: nightly snapshot job, dashboard page, board share link, saved reports with CSV
export, acknowledgment templates and queue, annual statements.

Done when: the dashboard numbers for the fixture org match a hand-calculated spreadsheet,
and a bulk acknowledgment run produces correct PDFs and emails.

## Definitions (shown as tooltips on the dashboard)

Only posted gifts count. Soft credits and pledges (promises, not money) are left out;
pledge payments count. "This year" is the organization's fiscal year to date; "last
year to date" is the same span one year earlier.

- Donors: distinct constituents with at least one counted gift in the period.
- New donors: their first counted gift ever falls in the period. Repeat donors: the rest.
- Retention follows the Fundraising Effectiveness Project. It is measured over the last
  two completed fiscal years, so the number does not swing as the current year fills in.
  - Overall retention: donors in the earlier year who gave again in the later year,
    divided by donors in the earlier year.
  - First-time donor retention: the same, for donors whose first gift ever was in the
    earlier year.
  - Repeat donor retention: the same, for donors who had also given before the earlier
    year.
- Lapsed donors: last gift between 13 and 15 months ago.

## Reports

LYBUNT (gave last fiscal year, not yet this one), SYBUNT (gave in an earlier year, but
not last year or this year), gifts by date range, gifts by fund, donors by campaign,
unacknowledged gifts, lapsed donors. Each has filters and a CSV download. Board viewers
cannot open reports; they list donors.

## Acknowledgments

Templates with merge fields, one letter and one email to start, both with IRS
substantiation language that changes with the gift: no goods or services, a stated
value for goods or services received, or a description for gifts of property.
The queue lists posted gifts that have not been thanked. Bulk email, bulk letters as one
PDF, and bulk mark as thanked. Annual statements for a tax year as one PDF or one email
per donor with the PDF attached. Email goes through Resend when `RESEND_API_KEY` is set,
otherwise through `SMTP_URL` (local Supabase's mail catcher at port 54325).
