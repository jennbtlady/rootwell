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

## What was built (2026-11-11)

| Brief item | Where | Status |
|---|---|---|
| Modules per organization | `organization_modules` (migration 0014, `custom/0016`); bundles in `packages/core/src/modules.ts`; API gate `packages/api/src/modules.ts` | Built. Every organization has Donations. Settings hides what an organization lacks; the API refuses it with `module_off`. |
| Turning modules on | `pnpm --filter @maple/api modules` (`packages/api/scripts/modules.ts`) | Built. Runs as the system actor, so each change is in the audit log. |
| Stripe Connect status | `accountStatus` on the gateway; `/integrations/stripe/refresh`; `account.updated` webhook | Built. "Connected" or "Needs more information", with Finish setup in Stripe and Check again. |
| Branding | `organizations.branding`, `logo_path`; Settings, Public page look; `packages/core/src/branding.ts` | Built. Two colors, logo, header image, WCAG contrast warnings, live preview. |
| Branded public pages | `PublicShell`, `brandStyle()`; `custom/0017` | Built. Giving and thank-you pages carry the brand and "Powered by Rootwell". |
| Embed | `apps/web/public/embed.js`; `/give/<slug>?embed=1`; Share and embed card on each giving page | Built. Frame resizes itself; checkout opens in the full window. Framing allowed on `/give/*` only. |
| Image storage | Public `branding` bucket (`custom/0018`) | Built. Owners and admins with two-step sign-in, own folder only; PNG, JPEG, WebP up to 2 MB. |

Also: the launch review's missing security headers (`nosniff`, `Referrer-Policy`,
`Permissions-Policy`, HSTS) on every page, and a sample organization that starts with
brand colors (`custom/0019`).

## Testing notes

- Local image uploads are refused while `MFA_ENFORCEMENT=off`, because storage checks
  two-step sign-in itself and local test accounts skip it. Everything else works. To try
  uploads locally, set up an authenticator on your test account.
- To try the embed locally, serve any HTML page on another port with the snippet from a
  giving page's Share and embed card, pointing at `http://localhost:3000/embed.js`.

## Tests

- `packages/api/test/routes.test.ts`: the Donations gate, and that only the system actor
  changes modules.
- `packages/api/test/stripe-status.test.ts`: needs more information through to taking gifts.
- `packages/core/test/branding-modules.test.ts`: bundles, contrast math, color and image
  path rules.
- `apps/web/e2e/fundraising-phase-1.spec.ts`: Public page look, warnings, preview, save.
- `apps/web/e2e/security-headers.spec.ts`: framing allowed on `/give/*` only, new headers.
- The isolation matrix in `packages/db/test` covers `organization_modules` automatically.

## Rollback

Migration `0014_fundraising_foundation`: drop `organization_modules`, the `org_module` type
and `organizations.branding`. Drop `app.add_core_modules`, `app.org_has_module`,
`app.branding_folder_org`, `app.sample_branding` and their triggers, and the four
`branding_*` storage policies; delete the `branding` bucket. Re-run
`app.public_donation_page` from `custom/0009`. The `needs_info` value can stay on
`integration_status`; set any such rows back to `connected`.
