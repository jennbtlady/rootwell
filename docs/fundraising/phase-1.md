# Fundraising module, Phase 1: Foundation

Brief: `docs/fundraising/brief.md` (Jenn, November 2026). This is Stage 2 of the plan agreed on
2026-11-11, after the launch-blocking security fixes (Stage 1, merged in pull request #1).

Done when: an organization admin can connect Stripe, set their branding, and see a preview of
a branded public page.

## Decisions (Jenn, 2026-11-11)

- **The brief reverses the original brief's v1 non-goals.** Online fundraising, peer
  fundraising and events were non-goals in `docs/lite-donor-crm-build-brief.md`. The new
  brief is the decision.
- **Stripe Connect stays Standard,** as decided in Phase 5. Each nonprofit owns its Stripe
  account, handles its own disputes and sets its own Radar rules. Rootwell never holds money
  or carries a nonprofit's losses, and pays no fee per connected account. Express would make
  Noble Maple responsible for disputes and negative balances.
- **Email stays Resend.** It is already built in. Receipts and notices send from the
  organization's name, with replies to its own address.
- **Embeds: a script tag and a frame.** One snippet works on WordPress and on a custom site.
  It shows the giving form in a frame that resizes itself. Payment opens in Stripe's own
  window, because Stripe Checkout will not run inside a frame. Framing is allowed for
  `/give/*` only.
- **Data model changes, approved:**
  - a new `organization_modules` table;
  - a `branding` column on `organizations`;
  - a "needs more information" status for Stripe connections;
  - a public storage bucket for logos and header images.
- **Mutt Strut comes first.** So peer fundraising (brief Phase 3) and events (brief Phase 4)
  will be built as one combined stage, so a walker can register and make a fundraising
  page in one flow.

## Flagged, not yet decided

- **Refunds:** today a refund on a posted gift is flagged on Data Health, because posted
  gifts are locked to the books. The brief wants refunds to update the gift. Suggested: a
  reversing entry. Decide before brief Phase 2.
- **Receipts and the thank-you list:** if online gifts get an automatic receipt, should they
  still wait in the thank-you list for a personal note? Decide before brief Phase 2.
- **Turning modules on:** there is no Noble Maple admin screen. For now a command script does
  it (see below).
