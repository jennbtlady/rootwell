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
- Donor matching by email, name and address. This phase adds the "flag for review" part.

## Proposed data changes (waiting for approval)

1. Gifts: a `refund` gift type, a `reverses_gift_id` column, and the amount rule changed so
   only refund entries are negative.
2. Gifts: a `donor_message` column for the optional message, kept apart from staff notes.
3. A new `gift_tributes` table: in honor of or in memory of, the honoree's name, and the
   optional person to notify (name, email, when it was sent). One row per gift.
4. A new `sponsor_animals` table: name, short description, optional photo, shown or hidden,
   sort order, and the fund gifts go to. Gifts and monthly gifts get a `sponsor_animal_id`.
   Photos go in the existing branding storage bucket, in the organization's own folder.
5. Giving pages: switches for tributes, a message, and which animals to show.
6. Organizations: a `receipts` setting (on or off, the tax-exempt statement, editable
   thank-you text).

No new table is needed for the monthly donor's self-service link (a signed link, like the
Stripe connect link) or for spike alerts.
