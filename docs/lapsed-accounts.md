# Lapsed accounts: keep or delete

Decided (Jenn, 2026-10-20): a lapsed account stays read only after its 90 days. Being
considered: deleting an account after a long stretch with no activity. Nothing is built
for deletion. This page is the assessment.

## What keeping one costs

Measured with one load-test organization: 10,000 donors, 30,000 gifts, emails, addresses,
duplicate pairs, and some history.

- **The rows take about 16 MB.** With indexes, about 30 to 40 MB on disk.
- **Supabase charges about $0.125 per GB a month for disk.** That makes one lapsed
  10,000-donor organization about half a cent a month. A thousand of them is about $4 to
  $5 a month.
- **A typical customer is much smaller.** Most have 500 to 3,000 donors, which costs a
  fraction of that.
- **History grows over the years.** The audit log adds to the total, but even several
  times this size is still pennies.

**Money is not the reason to delete.** The real considerations are below.

## Reasons to keep

- **Nonprofits need these records.** The IRS expects gift records to back up donor
  receipts and the Form 990, usually for 3 to 7 years. A treasurer who forgot to export
  could be badly hurt by deletion.
- **Organizations come back.** Volunteer treasurers change, budgets return, the year-end
  statements are due. A read-only account they can restart is the easiest win-back there
  is.
- **The brief promises it.** It says "exports always available". Deleting would mean
  changing that promise and the terms of service.

## Reasons to delete eventually

- **Risk.** Holding thousands of people's names, emails, and addresses for an organization
  that left years ago is risk with no benefit. A breach would expose people who have no
  relationship with us.
- **Privacy law.** Most US state privacy laws exempt nonprofits, but some do not, for
  example Colorado, Oregon, and Minnesota. "Keep no longer than needed" is the common
  expectation.
- **Housekeeping.** Every migration, backup, and load test carries the old data.

## Suggestion

**Keep read only. Delete only after 12 months with no activity, never 90 days.**

- **Why not 90 days:** a volunteer may sign in only at year end. Ninety days would delete
  accounts whose owners fully intend to come back for January statements. Twelve months
  guarantees one full annual cycle.
- **What counts as activity:** any member signing in, any export, or any billing action.
  A board link being viewed does not count.
- **Notices:** at 60, 30, and 7 days before deletion, email every owner and admin. Each
  notice includes a one-click link to Account and export, and a link to restart.
- **Deletion:** delete the organization's records. Keep one small record with no personal
  information (organization name, dates, who was notified) so we can answer "what
  happened to our account".
- **Backups:** backups roll off on their own schedule, 8 weeks for our weekly copy and
  Supabase's own retention. Say so in the terms.

## What building it would take

1. **A data model change (needs Jenn's OK).** `organizations.last_activity_at`, updated on
   sign-in, export, and billing actions. Also a small `deleted_organizations` record with
   no personal information.
2. **A daily job.** It finds lapsed, read-only organizations with no activity for 10, 11,
   and almost 12 months, and sends the notices. It is a background job, so it is a good
   first use for Inngest.
3. **The deletion itself.** A checked database function, run by that job as the system
   actor for the one organization. It cannot delete an organization that has any
   activity or a live subscription.
4. **Words.**
   - The terms of service and privacy policy.
   - The read-only banner ("If no one signs in for 12 months, this account will be
     deleted").
   - The Account and export page.
   - The billing help guide.
5. **Tests.**
   - Activity resets the clock.
   - Each notice goes once.
   - A paying or active account is never deleted.
   - The deletion leaves no rows behind.

Open question for Jenn: 12 months, or a different period? Do notices go only to owners and
admins (suggested), or to everyone on the team?
