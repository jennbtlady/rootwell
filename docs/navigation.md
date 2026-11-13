# Navigation map

This is how the app follows `docs/navigation-standard.md`. Read both before changing any
navigation, tab row, menu, or page header.

## Main areas (level 1)

Five, named for what people come to do. Always on screen: tabs across the top on a computer,
a tab bar along the bottom on a phone (under 640px wide).

| Area | Opens | Level 2 tabs | Covers |
|---|---|---|---|
| Home | `/app/orgs/{id}` | none | To-dos, Get set up, open batches, sample org notice |
| Donors | `/constituents` | All donors, Possible duplicates, Data health | Donor list and records, imports and Past imports (linked from the donor list and Data health), duplicates, merge history, Data health |
| Gifts | `/batches` | Batches, All gifts | Batches and batch entry, the gift list |
| Thank-yous | `/acknowledgments` | links on the page: templates, statements | Thank-you queue, templates, year-end statements |
| Reports | `/dashboard` | Board dashboard, Lists and downloads | The board dashboard, saved reports |

Board viewers see only Reports, and only the Dashboard in it.

## Settings (owners and admins)

Not a main area. A labeled "Settings" link sits beside the organization name (progressive
disclosure: administrative, so it is out of the main row, but visible text, never an icon).
Inside, one grouped list:

- Your organization: Team, Account and export, Billing
- Gifts: Funds, campaigns, appeals; Gift entry rules; Giving pages and Public page look (Donations module only)
- Connections: Stripe, Mailchimp, QuickBooks; Board sharing; Past imports

Help is a visible "Help" link in the top bar on every signed-in page.

## What adapts, and what never does

The five main areas never move, hide, or reorder. What is on Home adapts to where the
organization is:
- A new organization sees the setup guide.
- After setup, until the first gift, Home says "Ready for your first gift".
- After that, it shows the staff dashboard.

Role still decides who sees Settings, and board viewers see only Reports.

## Depth

At most three levels: main area, tab or settings page, detail. Examples: Donors, All donors,
one donor (the donor's own tabs are part of that page). Gifts, Batches, one batch.
Settings, Integrations. A fourth level means the content needs restructuring.

## How the code is laid out

Route groups keep the web addresses as they were while sharing each area's tab row:
`app/app/orgs/[orgId]/(donors)`, `(gifts)`, `(reports)`. Components:
`components/orgs/primary-nav.tsx` (level 1), `components/orgs/section-tabs.tsx` (level 2),
`components/settings/settings-nav.tsx`.

## Changes made on 2026-10-20

- Nine main items became five. Overview is now Home. Dashboard moved under Reports.
  Constituents is labeled Donors. Data health is Donors, Data health (it was briefly called Clean up). Team moved to Settings
  (its address is now `/settings/team`). Gifts gained an All gifts tab.
- Settings became one grouped list and gained Team, Account and export, and Billing.
