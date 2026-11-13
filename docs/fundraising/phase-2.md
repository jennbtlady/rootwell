# Fundraising module, Phase 2: Donations

Brief: `docs/fundraising/brief.md`, Phase 2. This is Stage 3 of the plan agreed on 2026-11-11.

Done when: a donor can give one-time or monthly to a designated fund in test mode, receive a
correct receipt, and the gift appears on the right donor record with its designation.

## Decisions (Jenn, 2026-11-12)

- **Refunds use a reversing entry.** The original gift stays as it is. A refund adds a
  second, negative entry on the refund date that points back at the gift. Totals net out,
  the books stay right for the month the gift came in, and the refund shows in the month it
  happened. Partial refunds work the same way, for the part refunded.
- **The receipt counts as the thank-you.** When an online gift's automatic receipt is sent,
  the gift is marked thanked and leaves the thank-you list. Staff can still send a personal
  note from the donor's record.

## Already built before this phase

- Giving pages with suggested amounts, a custom amount, one-time or monthly, and a choice of
  funds (Phase 5 of the original build).
- Year-end giving statements per donor, on demand and in bulk.
- Donor matching by email, name and address, with unsure matches put on the duplicate
  review list. This phase adds a test for it.

## Data changes (approved by Jenn, 2026-11-12)

Migration `0015_fundraising_donations` and `custom/0020_donations.sql`:

1. Gifts: a `refund` gift type and `reverses_gift_id`. Only refund entries are negative
   (`gifts_amount_sign`, which replaces `gifts_amount_positive`; the rule moved out of
   `custom/0003` because that file reruns on every migrate).
2. Gifts: `donor_message`, kept apart from staff notes.
3. `gift_tributes`: in honor or memory, the honoree, and the optional person to tell.
4. `sponsor_animals`, with `sponsor_animal_id` on gifts and monthly gifts.
5. Giving pages: `allow_tribute`, `allow_message`, `animal_ids`.
6. Organizations: `receipts` (on or off, thank-you, tax statement, sign-off, reply-to).

No table for the monthly donor's link (it is signed) or for spike alerts (the rate-limit
counter).

## What was built (2026-11-12)

| Brief item | Where | Status |
|---|---|---|
| Form builder: amounts, custom amount, one-time or monthly, optional message | Giving page settings; `give-form.tsx` | Amounts and monthly were built in Phase 5. The message box is new, on per page. |
| Designations: funds and sponsor-an-animal | Settings, Animals to sponsor; `services/animals.ts`; `routes/donations.ts` | Built. A sponsored gift goes to the animal's fund. An animal with gifts is hidden, never deleted. |
| Tribute gifts with a notice | `gift_tributes`; `buildTributeNotice` in `packages/core/src/receipts.ts` | Built. The notice goes from the organization's name and leaves out the amount. For a monthly gift, the tribute goes with the first month only. |
| Donor matching, flag when unsure | `matchOrCreateDonor`; the duplicate scan trigger (`custom/0005`) | Already built: a weak match makes a new record, and the scan puts the pair on the review list. Now tested. |
| Automatic, branded receipts with IRS wording, editable text | Settings, Online receipts; `email/receipts.ts` | Built. Sent under the organization's name, replies to its office. A sent receipt counts as the thank-you. |
| Monthly donors update their card or cancel | `/manage/<link>`; `manageSubscriptionUrl` (Stripe customer portal) | Built. The link is signed and lasts 13 months; each receipt carries a fresh one. Opening it changes nothing; the button goes to Stripe. |
| Year-end statement on demand | Reports, Year-end statements | Built in Phase 4. Refunds now net out, and someone fully refunded gets no statement. |
| Refunds and disputes | `recordReversal` in `services/online.ts`; `charge.refunded`, `charge.dispute.*` | Built. See below. |
| Spike alerts | `warnAboutSpike` in `routes/public-give.ts` | Built. When a giving page hits its checkout limit, owners and admins get one email, at most every six hours per page. |

## How refunds work

A refund in Stripe adds a negative entry on the refund date that points back at the gift.
The gift never changes. Partial refunds work the same way, one entry per Stripe refund.

- Dollar totals (reports, dashboard, donor lifetime, campaign goals) include the refund
  entries, so they net out.
- Gift and donor counts, first and last gift dates, gift sizes, and the thank-you list leave
  them out. A refund is never "a gift".
- A refund entry is made already marked as thanked ("Not needed (refund)").
- Refund entries come only from Stripe and cannot be edited. A gift with a refund cannot be
  deleted.
- Refunds join the Stripe deposit they come out of, so the batch still adds up.
- Disputes show on Data Health with the date to answer by. A lost dispute is reversed the
  same way, and Data Health notes Stripe's dispute fee. A won dispute changes nothing.

## Receipts

The receipt has the organization's name, a statement of its tax-exempt status, the amount
and date, what the gift was for, and "No goods or services were provided" (Publication
1771). The organization can change the thank-you, the tax statement and the sign-off.

- Receipts are on by default. Turned off, online gifts wait on the thank-you list.
- A donor with no email, or marked do not email, gets no receipt email. The gift stays on
  the thank-you list for a letter.
- A failed send shows on Data Health and the gift stays on the thank-you list.

Have an accountant read the receipt wording before the first tax season.

## Before going live with real Stripe

The monthly donor link uses Stripe's customer portal on each nonprofit's own Stripe
account. Rootwell makes a portal setup for donors (change card, stop the gift, see past
payments) the first time a donor uses it. Test this once in Stripe test mode with a real
connected account before launch.

## Testing notes

- Local receipts and tribute notices land in the mail catcher at http://127.0.0.1:54324.
- The sample organization (a food pantry) has a tribute with a message and a $10 refund,
  but no animals.

## Tests

- `packages/api/test/stripe-refunds.test.ts`: partial and full refunds, replays, the deposit
  batch, the fund report, disputes, unsure matches, refund entries locked.
- `packages/api/test/donations.test.ts`: animals, tributes, messages, receipts and their
  settings, the monthly donor link, tampered links.
- `packages/core/test/receipts.test.ts`: the receipt's IRS wording, an organization's own
  words, defaults, and a tribute notice with no amount.
- `packages/api/test/rate-limits.test.ts`: the spike alert, once.
- `packages/api/test/routes.test.ts`: the new routes refuse another organization.
- `packages/db/test/billing.test.ts`: the sample organization's Phase 2 data.
- `apps/web/e2e/fundraising-phase-2.spec.ts`: animals, receipts, the giving page, a donor at
  375px with an accessibility scan and keyboard check, and the gift's extras.

## Rollback

Migration `0015_fundraising_donations`: delete refund entries (`gift_type = 'refund'`), then
drop `gift_tributes`, `sponsor_animals`, the `tribute_kind` type, and the new columns on
`gifts`, `recurring_plans`, `donation_pages` and `organizations`. Drop `gifts_amount_sign`
and add back `check (amount > 0)`. Drop `app.alert_recipients`, `app.sample_phase2`,
`app.sample_refund` and their triggers. Re-run `app.protect_posted_gift` from `custom/0003`,
`app.public_donation_page` from `custom/0017` and `app.compute_dashboard` from `custom/0007`.
The `refund` value can stay on `gift_type`.
