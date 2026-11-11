# Rootwell Fundraising Module: Build Brief

## How to use this brief

Read the whole brief, then look at the existing Rootwell codebase before writing anything. Reply with a short plan: how this fits the current stack and data model, the order you'll build in, and any decision you need from me. Wait for my go-ahead before starting Phase 1.

If something here conflicts with what's already built, tell me instead of working around it. If anything is unclear, ask.

## Context

Rootwell is a donor database (CRM) for small nonprofits, built by Noble Maple Consulting. Most customers have one to five staff, and the person using Rootwell is often an executive director doing development on the side. They are not technical.

This module adds online fundraising, so an organization can take donations, run individual and team fundraising campaigns, and sell event tickets without paying for a separate platform such as Classy (GoFundMe Pro).

The first customer is Kennebec Valley Humane Society (KVHS), an animal shelter in Augusta, Maine. Today they pay over $800 a month for Classy and run two to three fundraisers a year, including:

- **Heroes Brunch and Auction:** a ticketed event with an online auction, run on a separate auction app they also pay for
- **Mutt Strut:** a walk with teams and individual fundraising pages

They see individual fundraising (supporters raising money for KVHS on their own pages) as their biggest growth opportunity.

## What makes this different from free tools

Zeffy, Givebutter and others already offer these features for free, funded by tips they ask donors for at checkout. Rootwell's advantages are:

1. **One system.** Every gift, ticket and fundraiser lands directly in the donor record. Nobody re-enters or imports data.
2. **No tip prompts.** Donors never see a request to tip the platform. The only optional add-on is "cover the processing fee," which goes to the nonprofit.
3. **Built for shelters.** Memorial and tribute gifts, sponsor-an-animal giving and designated funds work out of the box.
4. **Simple.** Every screen should be usable by someone who has never run an online campaign.

Keep these in mind when making design trade-offs.

## Architecture: modules and entitlements

Build each capability as a module that can be switched on or off per organization:

| Module key | Includes | Planned bundle |
|---|---|---|
| `donations` | Donation forms, recurring gifts, designations, receipts | Core |
| `peer_fundraising` | Campaigns, individual pages, teams, leaderboards | Fundraising |
| `events` | Ticket types, registration, guest list, check-in | Fundraising |
| `auction` | Future, not in this build | Add-on |

Requirements:

- An `organization_modules` (or equivalent) table controls which modules each organization has.
- The UI hides anything an organization doesn't have. The API rejects calls to disabled modules.
- Bundles map to sets of modules in one place, so pricing can change without touching feature code.
- Don't build billing for Rootwell subscriptions yet. A Noble Maple admin turns modules on manually.

Everything is multi-tenant. Every record carries the organization ID, and no query can return another organization's data. Add tests that prove this.

## Payments

- Use **Stripe Connect** (Standard or Express accounts; recommend which and why). Each nonprofit connects its own Stripe account. Funds go straight to the nonprofit. Rootwell never holds money.
- Never store or handle card numbers. Use Stripe Elements or Stripe Checkout so card data stays with Stripe.
- No application fee on transactions in this build. Make it possible to add one later per organization, set to zero by default.
- Support cards, Apple Pay, Google Pay and ACH bank transfer where Stripe supports them.
- **Cover the fee:** an optional checkbox that adds the estimated processing fee to the gift. Each organization chooses whether it's shown and whether it's checked by default.
- Handle refunds, failed recurring payments (use Stripe's retry and dunning emails) and disputes. Each of these updates the gift record and shows up in reports.
- All Stripe events arrive by webhook. Verify signatures, handle events idempotently and log failures somewhere an admin can see.

## Fraud and abuse protection

Public donation forms are a common target for card-testing bots. From the first release:

- Stripe Radar rules turned on
- Rate limiting by IP address and by form
- A bot check such as Cloudflare Turnstile on public forms
- An alert to the organization when an unusual spike in small or failed transactions occurs

## Phase 1: Foundation

- Module entitlement system as described above
- Stripe Connect onboarding flow for an organization admin, with clear status ("connected," "needs more information")
- Organization branding for public pages: logo, primary color, accent color and a header image. Public pages carry the nonprofit's brand. Rootwell appears only as a small "Powered by Rootwell" in the footer.
- Public pages work as standalone URLs and as an embed (script tag or iframe) for the organization's own website. KVHS's website is moving to kvhumane.org.

**Done when:** an organization admin can connect Stripe, set their branding and see a preview of a branded public page.

## Phase 2: Donations

- Donation form builder: suggested amounts, custom amount, one-time or monthly, optional message
- **Designations:** general fund, named funds the organization defines and sponsor-an-animal (donor picks from a list the organization maintains, with an optional photo)
- **Tribute gifts:** in honor of or in memory of a person or pet, with an optional notification email to someone the donor names
- **Donor matching:** each gift finds an existing donor by email first, then name and address. If unsure, it creates a new record and flags it for review instead of merging silently.
- **Receipts:** sent automatically by email, branded per organization, with the IRS-required wording (organization name, a statement of its tax-exempt status, gift amount and date, and a statement that no goods or services were provided, or their value if they were). Organizations can edit the thank-you text.
- **Recurring donors** can update their card or cancel through a secure link in their receipt email, without needing an account.
- Year-end giving statement per donor, generated on demand

**Done when:** a donor can give one-time or monthly to a designated fund in test mode, receive a correct receipt, and the gift appears on the right donor record with its designation.

## Phase 3: Individual and team fundraising

- **Campaigns** with a goal, dates, story, images and a progress bar
- Supporters create their own fundraising page under a campaign in a few steps: name, photo, personal goal and story. Creating a page also creates or matches a donor record.
- **Teams:** supporters can create or join a team. Team pages total their members' fundraising.
- Leaderboards for individuals and teams, which the organization can turn off
- **Year-round fundraising:** an always-on campaign (for example "Fundraise for KVHS") for birthdays, memorials and personal challenges
- **Moderation:** the organization can approve, edit or hide supporter pages. Choose approve-first or publish-immediately per campaign.
- Supporters get a simple dashboard: their total, their donors, a share link and suggested messages
- Every donation through a supporter's page records both the donor and the fundraiser who brought them in. The organization can see each fundraiser's total and the donors they recruited, so it can thank fundraisers and follow up with new donors.

**Done when:** a supporter can create a page, join a team and share it; a donor can give through it; and the organization can see the gift credited to the donor, the fundraiser and the team.

## Phase 4: Events and ticketing

- Events with date, location (or online), description and capacity
- **Ticket types** with price, quantity limit and sale dates. Each ticket type records its **fair market value** so receipts show the tax-deductible portion correctly (for example, a $75 brunch ticket with a $30 meal value has $45 deductible).
- Option to add a donation at checkout
- Collect each guest's name and details for multi-ticket purchases, plus custom questions (meal choice, T-shirt size)
- Registration that combines with fundraising: for a walk, a registrant can buy their entry and create their fundraising page in one flow
- Guest list with export, and **check-in** on a phone or tablet by searching a name or scanning a QR code from the ticket email
- Event reports: tickets sold, revenue, donations, attendance

**Done when:** KVHS could run Mutt Strut registration and check-in end to end in test mode.

## Not in this build: the auction

Don't build auction features. For now, add a simple CSV import so an organization can bring auction results (winner, item, amount paid, fair market value) from its separate auction app into donor records.

A full auction module will get its own brief later, after this module has run a real event.

## Migration from Classy

Build a CSV import that brings in an organization's history from Classy:

- Donors and contact details
- Past transactions, with campaign and designation
- Active recurring donors, with a clear note that recurring payments can't be moved automatically. Donors need to re-enter card details, or the organization arranges a Stripe data migration. Build a simple re-signup email flow for these donors.

Show a preview with field mapping and duplicate detection before anything is saved.

## Reporting

- Dashboard per campaign and event: total raised, number of donors, new versus returning donors, average gift
- Totals by designation and by fundraiser
- These numbers also feed the existing board dashboard
- CSV export of any report

## Design and accessibility

- Mobile first. Most donors and fundraisers will be on phones.
- Meet WCAG 2.1 AA: keyboard navigation, screen-reader labels, color contrast checked against each organization's own brand colors (warn the admin if their colors fail contrast)
- Admin screens use the Rootwell brand (Fredoka for headings, Nunito for interface text, existing Rootwell colors). Public pages use the organization's brand.
- Plain language everywhere. "Monthly gift" instead of "recurring subscription," and "people raising money for you" instead of "peer-to-peer."

## Email

Use a transactional email provider (recommend one). Receipts, tribute notifications and fundraiser updates send from the organization's name, with replies going to the organization's email address. Set up SPF, DKIM and DMARC guidance for organizations that want to send from their own domain.

## Testing

- Everything runs against Stripe test mode with seeded demo data (a fictional shelter, campaigns, teams, donors)
- Automated tests for money handling: totals, refunds, fee coverage, receipt deductible amounts, webhook idempotency and tenant isolation
- A load test that simulates an event-night spike before Phase 4 goes live

## Decisions I need from you before or during Phase 1

1. Stripe Connect account type, and why
2. Transactional email provider
3. How the embed should work on a WordPress site and on a custom-built site
4. Any changes this module needs in the existing donor and gift data model

## Working style

- Build one phase at a time and stop for my review at the end of each phase.
- Keep a running `CHANGELOG.md` and update the README with setup steps for Stripe test mode.
- Commit in small, clearly described steps.
