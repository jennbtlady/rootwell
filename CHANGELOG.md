# Changelog

What changed, newest first, in plain language. Details live in `docs/`.

## Fundraising Phase 2: Donations (2026-11-12, branch `fundraising/phase-2-donations`)

- **Refunds keep the books right.** A refund in Stripe adds a matching negative entry on the
  refund day. The gift stays as it was. Totals net out; refunds never count as gifts.
- **Disputes** show on Data Health with the date to answer by. A lost dispute is reversed
  the same way.
- **Automatic receipts.** Every online gift gets an email receipt with what the IRS asks
  for, from your organization's name. It counts as the thank-you. Settings, Online receipts.
- **Sponsor an animal.** Settings, Animals to sponsor. Giving pages can show them, and the
  gift goes to the animal's fund.
- **In honor or memory.** Donors can name a person or pet, and ask you to email someone.
  That email leaves out the amount.
- **A message box** on giving pages, when you turn it on.
- **Monthly donors** can change their card or stop, from a private link in their receipt.
- **A warning email** to owners and admins when a giving page suddenly gets far more
  checkouts than usual.

See `docs/fundraising/phase-2.md`.

## Fundraising Phase 1: Foundation (2026-11-11, branch `fundraising/phase-1-foundation`)

- **Modules.** Each organization has a set of modules. Everyone has Donations. People raising
  money for you, and Events, come next and are turned on by Noble Maple for now.
- **Stripe status.** A Stripe account that still owes Stripe details shows "Needs more
  information", with a button to finish setup and one to check again. Giving pages take gifts
  only once Stripe is ready.
- **Your brand on giving pages.** Settings, Public page look: colors, logo and a header photo,
  with a live preview and warnings when colors are hard to read.
- **Giving form on your own website.** Each giving page has a copy-and-paste code for
  WordPress or any website. Payment opens on Stripe's secure page.
- **Security headers** from the launch review, on every page.

See `docs/fundraising/phase-1.md`.

## Launch readiness (2026-11-11, pull request #1)

- Two-step sign-in is required by the API, not only by the pages, and for every download.
- The Stripe stand-ins can never run in production.
- Rate limits on public pages and bulk email, and a bot check on public forms.
- Imports stay fast on a brand-new database.
- CI runs the browser tests on the dev server, with every key they need.

See `docs/phase-6.md` and `docs/rate-limits.md`.
