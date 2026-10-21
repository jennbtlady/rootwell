# Placeholders for future builds

Jenn asked on 2026-10-20 to hold a place for three user-experience features. Each has
something on screen now so the spot is reserved, and a plan here so the build can start
without re-deciding the basics. Each one follows `docs/navigation-standard.md`.

## 1. Guided setup walkthrough

**On screen now:** Home shows a "Get set up" card for owners and admins until the required
steps are done. It opens `/app/orgs/{id}/setup`, which lists six steps, ticks each off from
the data, and links to the page where it is done. A note says a guided walkthrough is coming.
The steps come from `setupProgress()` in `packages/core/src/services/setup.ts`, and their
wording from `apps/web/src/lib/setup-steps.ts`.

**The build:**
- One step per screen, with Back, Next, and Skip for now.
- Each step does the work right there, using the same forms the settings pages use:
  - Add funds from a short starter list.
  - Pick gift rules from two presets.
  - Upload a spreadsheet.
  - Invite people.
  - Pick a letter template.
- A progress bar at the top, and "Save and finish later" on every step.
- It opens on its own the first time an owner signs in to a new organization. After that,
  it is reachable from the Get set up card.
- Done when a new owner finishes setup in under 30 minutes without opening Help (the
  brief's target). Test it with the personas in `docs/personas.md`.

**Data model:** probably none. Progress is worked out from the data. A "dismissed" flag
per person may be needed so it stops opening on its own. Ask before adding it.

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

**On screen now:**
- One dashboard (Reports, Dashboard) is shared by staff, board viewers, and board links.
- Home has a few staff to-dos.

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
