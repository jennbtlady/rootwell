# Accessibility audit

Date: 2026-10-20. Standard: WCAG 2.1 AA. Branch `phase-6/launch-readiness`.

## How it was checked

Automated, and run on every change from now on:

- `apps/web/e2e/accessibility-audit.spec.ts`
  - An axe scan (WCAG 2.0 and 2.1, A and AA) of every page an owner can reach: 28 pages,
    plus one donor record, one batch, and one report reached by clicking through.
  - Keyboard:
    - The skip link is the first tab stop and moves focus to the page content.
    - The main navigation works with Tab and Enter.
    - A dialog keeps focus inside, closes with Escape, and returns focus to the button that
      opened it.
    - A donor can be added with the keyboard alone.
    - Every tab stop on a busy settings page shows a focus ring.
  - Reflow: eight key pages fit at 320px wide without sideways scrolling, the same as
    400% zoom (WCAG 1.4.10).
- `apps/web/e2e/mobile-forms.spec.ts`
  - Every form on iPhone Safari (WebKit) and Android Chrome.
  - Each one checked for sideways scrolling, the axe scan, and text fields of at least 16px.
- The earlier acceptance flows (Phases 1 to 5) scan each screen they visit.

## What was found and fixed in this audit

| Finding | WCAG | Fix |
|---|---|---|
| No way to skip the header and navigation | 2.4.1 Bypass blocks | "Skip to main content" link, first on every signed-in page |
| Text fields were 14px, so iPhone Safari zoomed the page on every tap | Usability on phones; supports 1.4.4 | Fields are 16px on phones, 14px from 640px up |
| Settings pages stretched past the screen on a phone when a table was wide | 1.4.10 Reflow | The settings column is held to the screen width; tables scroll in their own box |
| Dashboard "how is this counted" boxes stuck out past a 320px screen | 1.4.10 Reflow | Closed boxes take no space; an open box slides left to stay on screen |
| The Mailchimp key field was fixed at 320px | 1.4.10 Reflow | Full width on small screens |

Fixed in earlier phases and still covered by the tests:
- Contrast on primary buttons.
- Scrollable tables that could not be reached by keyboard.
- Labels on every input.

## One exclusion, and why

Base UI, the library behind dialogs, puts invisible "focus guard" elements around an open
dialog to keep keyboard focus inside it. In Safari these carry `role="button"` with no name,
and axe reports them. They are never visible and never read as content, so the scan skips
`[data-base-ui-focus-guard]` only. Nothing else is excluded.

## Still to do by hand before launch

Automated tools find roughly a third to a half of accessibility problems. Before launch:

1. A screen reader pass with VoiceOver on iPhone and Mac, and NVDA on Windows, through the
   five everyday tasks:
   - Find a donor.
   - Enter a batch of gifts.
   - Post it.
   - Send thank-yous.
   - Read the dashboard.
2. Browser zoom at 200% on a laptop, through the same tasks.
3. A test with one or two real users who rely on a keyboard or a screen reader. The
   personas in `docs/personas.md` describe who to recruit.
