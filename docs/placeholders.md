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

## 3. Customizable director dashboard

**On screen now:** nothing yet. The dashboard (Reports, Dashboard) is the same for everyone.
This is a placeholder in this document only, so the screen does not show a control that
does nothing.

**The build:**
- A "Customize" button on the dashboard, for owners and admins.
- It lets them choose which cards show, put them in order, and pick a default date range:
  this fiscal year, last 12 months, or this calendar year.
- Board links and board viewers see the organization's chosen layout.
- "Reset to the standard layout" is always available.
- Cards come from the existing dashboard computation, so no new numbers are invented.

**Data model:** this needs a place to save the layout. Most likely that is one jsonb column
on `organizations`, or a small `dashboard_layouts` table if each person gets their own.
Ask Jenn which: one layout for the organization (simpler, what the board sees) or one per
person.
