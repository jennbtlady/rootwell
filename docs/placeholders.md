# Placeholders for future builds

Jenn asked on 2026-10-20 to hold a place for three user-experience features. Each has
something on screen now so the spot is reserved, and a plan here so the build can start
without re-deciding the basics. Each one follows `docs/navigation-standard.md`.

## 1. Guided setup walkthrough

**Built (2026-10-21)**, designed from the persona walkthroughs
(`docs/usability/2026-10-21-persona-walkthroughs.md`).

- **Home is the guide.** A new organization sees "Welcome. Let's get ... set up" with the
  steps, instead of a dashboard of zeros. Home switches to the staff dashboard once the
  required steps are done or a gift exists. Until the first gift, it says "Ready for your
  first gift". The five main areas never move; only what is on Home changes.
- **The walkthrough** is at `/app/orgs/{id}/setup`, one step at a time, done in place, each
  with Back, Skip for now, and Finish later:
  1. About your organization: name, EIN, mailing address, fiscal year explained, and time
     zone in plain names.
  2. Where gifts go: starter funds ticked in one go, plus an optional current campaign with
     a goal.
  3. How gifts are recorded: the recommended rules in plain words, with the fund and
     campaign to fill in on new gifts.
  4. Your donors: a spreadsheet, a few by hand right there, or an empty list.
  5. Your team: invite right there. Optional.
  6. Your thank-you letter: a preview with their own EIN and address, and who signs it.
  7. You're ready: what is done, what was skipped, and the next three things.
- **Honest progress.** A step ticks only after a person decides. Opening the letter
  page no longer counts.
  - Required: organization details, funds, and gift rules.
  - Recommended: donors and the thank-you letter.
  - Optional: team and online giving.
- **Also from the findings:**
  - The gift form says "Add a fund before entering gifts", with a link, when there are none.
  - New gifts are prefilled with the chosen campaign.
  - Settings has an Organization details page.
  - Phones keep the field being typed in above the bottom tab bar.
- **Code:**
  - `components/setup/*`
  - `lib/wizard-steps.ts`
  - `setupProgress` and `inSetupMode` in `packages/core/src/services/setup.ts`
- **Tests:** `apps/web/e2e/setup-wizard.spec.ts`. The whole journey at 1280px and 375px, with
  an accessibility scan at every step.

**Not done yet:**
- **The import improvements from the walkthroughs.** These are: "were these gifts already
  thanked?", matching fund and campaign names, and showing past imports where imports start.
- **Opening on its own.** The walkthrough does not open by itself on first sign-in. Home
  leads to it instead, which needs no stored flag.

## 2. Knowledge base and chat assistant

**On screen now:**
- A visible Help link in the top bar on every signed-in page.
- `/app/help` lists eleven plain-language guides by topic.
- Each guide has its own page. The guides live in `apps/web/src/content/help.ts`.
- A note on Help says a chat assistant is coming.

**The build, knowledge base:**
- Search across the guides.
- "Was this helpful?" on each guide.
- A "Help with this page" link that opens the right guide from the screen you are on.
- Guides stay in the repository, so a screen and its guide change in the same pull request.

**The build, chat assistant:**
- A Claude model answers questions using only the guides, with links to the guide it used.
- It never sees donor data unless that is decided separately, with a privacy review.
- It says plainly when it does not know, and offers the guides or a person.
- Every answer can be rated.
- Open questions:
  - The model and its cost per organization.
  - Whether answers are logged, and for how long.
  - A support contact for when it cannot help.

## 3. Two dashboards, staff and board, each customizable

Direction (Jenn, 2026-10-20): a staff view for the executive director and development
director, and a separate board dashboard. Each can be customized, with one layout per
organization to start.

**Built (2026-10-20):** both dashboards, as proposed below.
- Staff: `components/dashboard/staff-dashboard.tsx` on Home, with live to-dos from
  `staffHome()`.
- Board: `components/dashboard/board-dashboard.tsx` under Reports, Board dashboard, and on
  board links.
- The nightly figures gained `campaignGoals` and `lybunt`.

**Still a placeholder:** Customize, choosing and ordering the cards for each view.

**Proposal, built from `docs/personas.md`:**

- **Staff dashboard, on Home (Dana and Marcus: "what do I do next, and how are we doing").**
  - To-dos, each linking to the list that clears it:
    - Gifts to thank, with gifts of $250 or more that legally need a letter called out.
    - Batches waiting to post.
    - Online gifts waiting for their deposit.
    - Possible duplicates.
    - Refunds to handle.
  - This year so far against last year so far: dollars and donors.
  - Donor retention, and first-time donor retention, where a quick thank-you call matters
    most.
  - Lists that lead to action:
    - LYBUNT (gave last year, not yet this year).
    - Lapsed donors.
    - Top donors who have not given this year.
  - Campaign goals, and recent gifts.
  - Donor names are shown.
- **Board dashboard, Reports, Dashboard (Ruth: "are we on track", in two minutes, no
  login).**
  - A sentence first, such as "Giving is up 12% compared with this time last year".
  - Then the comparison, campaign goals, the monthly trend with its table, giving by fund,
    and retention with plain definitions.
  - No to-do lists. Donor names hidden unless the organization turns them on, as today.
  - It fits on one printed page.
  - It is what board links and board viewers see. Staff can open it to see exactly what the
    board sees.
- **Navigation:** this keeps the five main areas, per the navigation standard. Home becomes
  the staff view, and Reports, Dashboard becomes the board view. No new level.
- **Customize:** owners and admins choose which cards show, and in what order, separately
  for each view.

**Data model:** one jsonb column on `organizations`, for example
`dashboard_layouts = { "staff": [...], "board": [...] }`.

## 4. Goal thermometer on giving pages

Jenn, 2026-10-20: a fundraising thermometer, or a "goal against raised so far" bar, on
giving pages.

**On screen now:** nothing on the public page. The staff and board dashboards already
show campaign goals as progress bars.

**The build:**
- **The setting:** a giving page tied to a campaign with a goal gets a choice: "Show
  progress toward the goal", with a bar or a thermometer.
- **The total:** raised so far counts posted gifts plus online gifts not yet posted, so
  donors see their own gift reflected right away. It is worked out by the database
  function that serves the public page (`app.public_donation_page`), and it shows only
  totals, never names.
- **Options:** show the dollar amounts, or only the percentage, for organizations that
  would rather not publish totals. Hide it automatically after the campaign ends.
- **Accessibility:** the bar has a text equivalent ("$4,450 of $20,000 raised, 22%"), and
  any animation respects reduced motion.

**Data model:** two small settings on `donation_pages`: whether to show progress, and how.
Ask before adding them.
