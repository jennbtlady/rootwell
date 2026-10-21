# Persona walkthroughs, 2026-10-21

Expert walkthroughs of the app as the three personas in `docs/personas.md`, plus a fourth
journey: a brand-new nonprofit setting up for the first time. These are not sessions with
real people. They were run by Claude acting as each persona, through the real screens, on
desktop and phone (iPhone Safari and a 375px screen with large text). They show where the
app is likely to fail people. Sessions with real participants (personas doc, "How many
sessions to run") are still the next step for confirming them.

Screenshots and notes are kept outside the repository (they contain test sign-ins).

## Overall verdict

The app works. Every core task can be finished, and several parts earned trust:
- **The import wizard:** plain problem messages, fixing a row in place, and rollback.
- **Merge:** side-by-side records, keyboard support, and 30-day undo.
- **The board dashboard's opening sentence:** it answers "are we on track?" in words.
- **The first donor to first thank-you loop:** about 8 clicks.

What holds it back is not missing features. It is that the app assumes the person already
knows how a donor database works:
- **Words.** "Batch", "post", "fund versus campaign versus appeal", "LYBUNT",
  "retention".
- **Order.** Gifts before funds, and thank-yous that only appear after posting.
- **Places.** Rollback under Settings, and "Clean up" versus "Data health".

A first-time user hits dead ends and misleading signals within the first ten minutes. That
is exactly the gap the onboarding wizard should close.

## Blockers

1. **The EIN and mailing address cannot be entered anywhere.**
   - Letters print "(add your EIN in settings)", and statements ask for the EIN, but no
     page could set it.
   - The create-organization form promises "You can change any of this later in settings."
   - Status: the backend is done (2026-10-21). The settings screen is next.
2. **Entering gifts before any fund exists is a dead end.**
   - Home's main button is "Enter gifts". The gift form requires a fund, but the fund list
     is empty, and nothing says to add one or links to where.
   - Errors show one at a time, so the fund problem appears late.
3. **The spreadsheet and the board page disagree, with no explanation.**
   - Gifts by fund starts at January 1. The board page starts at the fiscal year start
     (July 1 in the sample): $16,025 against $5,375.
   - The download does not state its date range.
   - Fixed 2026-10-21: dated reports start at the fiscal year start, like the board page.
     The report says "Gifts dated ... through ...", the filters show the same dates, and the
     file name includes them. The total row now has gift and donor counts.

## Major

From Dana (executive director):

- **D-a. Numbers are a day old after posting.** Fixed 2026-10-21: posting a batch, and
  committing or undoing an import, recompute the dashboard at once.
  - Home, the board dashboard, and the board link kept showing the overnight figures
    after a batch was posted: "down 24%", when the real figure was "down 9%".
  - This is Dana's main fear: a board number that does not match the bank.
  - Fix: refresh when a batch is posted, and show "Updated at ..." plainly.
- **D-b. Nothing records that year-end statements were emailed.** Fixed 2026-10-21: a new
  `statement_sends` table records each send. Emailing skips donors already emailed unless
  "Send everyone a second copy" is chosen, "Download the N to print" leaves out emailed
  donors, and every row shows "Emailed" or "Printed" with the date. After sending, the page
  looks the same, so a second click sends 36 duplicate tax letters. "Download all" also
  prints the emailed donors, so they get two copies.
- **D-c. A batch that does not match the deposit posts with one OK.** Corrected
  2026-10-21: the database already refused a mismatch, so wrong numbers were never locked.
  The real problem was the wording.
  - The page now says "$25.00 short of the deposit slip ($200.00)", and gives the count in
    words.
  - Posting opens an in-app dialog with the difference in dollars and "Go back and check"
    as the first choice, plus "The slip was wrong" to correct the slip total and post.
  - The database's refusal is in plain words.
  - A matching batch gets a plain explanation of what posting does. The plain browser
  confirm lists both totals but not the $25 difference. While working, the page shows
  only "Deposit says $1,040.00", never "$25.00 short".
- **D-d. Gifts in an open batch cannot be edited.** The only option is Remove and retype.
- **D-e. "This year" means fiscal year on Home and the board, but calendar year on the
  donor page.** The same donor reads as "$900 last year, not yet this year" on Home and
  "$1,150 this year" on her record.
- **D-f. Phone: the field being typed in hides behind the bottom tab bar** (Add a donor,
  Email, at 375px).

From the other journeys:

4. **Empty Home is a wall of zeros.** For a new organization, Home shows $0.00, "No
   data", and retention definitions with "soft credits" and "FY2025 to FY2026". "To do"
   says "Nothing waiting", while setup is the real to-do. "Get set up" is just one card
   among many.
5. **Setup steps leave setup.** Each step opens full Settings, with a nine-item side list,
   and nothing leads back or on to the next step.
6. **Setup progress is wrong.**
   - Opening Thank-you templates silently creates default templates and ticks the step
     Done.
   - The gift rules step stays "To do" unless saved, even though the defaults are fine.
7. **Day-one pages ask for expert decisions.**
   - Funds explains fund, campaign and appeal at once.
   - Gift entry rules has 11 instruction boxes.
   - Templates ask people to keep "{{substantiation}}".
8. **Imported past gifts flood the thank-you queue.** Old gifts arrive "unthanked". The
   only ways out are thanking people again or logging false phone calls. That buries the
   real queue and makes Data health look worse after an import.
   Fixed 2026-10-21: the last import step asks "Were these gifts already thanked?" It
   defaults to yes for gifts more than 30 days old. Those gifts are recorded as thanked on
   their gift date, with the method "before import".
9. **Import creates funds and campaigns by name with no review.** "General" in a file
   became a second fund next to "General operating".
   Fixed 2026-10-21: the last step lists each fund, campaign and appeal name in the file,
   matched to an existing one. "General" is suggested as "General operating" and marked
   "Close match, please check". New ones are created only if the person chooses that.
10. **Gifts that are not yet posted are invisible where people look for them.**
    - This week's gifts are not in Thank-yous, with no explanation.
    - The "gave last year, not this year" list includes people who gave this week.
    - Fixed 2026-10-21: Thank-yous says how many gifts wait in batches that are not posted,
      with a link. The list leaves out anyone with a gift this year, posted or not.
11. **People-list downloads cannot be used for a mailing.** There are no address columns,
    no separate first name, and no do-not-mail flag.
    Fixed 2026-10-21 for the three people lists (gave last year, gave before, lapsed). The
    download adds first and last name, organization, address, and "Do not mail". The page
    stays narrow and says the file has them.
12. **Rollback is hard to find.** Past imports live only under Settings, Connections,
    Imports.
    Fixed 2026-10-21: a "Past imports" link on the donor list, on the import page, and on
    Data health. The list says which imports can be undone.
13. **The import's "Review matches" step gives too little to decide on.** Every card says
    "70% similar name", even for identical names. There are no details of the existing
    record.
    Fixed 2026-10-21: identical names say "Same name", and the percentage is gone. Each
    card shows the row from the file next to the existing record's email, phone, address,
    and gift count with the last gift date.
14. **Retention is jargon, and the sample data makes it look broken.**
    - The explanation leads with "Fundraising Effectiveness Project definition".
    - "FY2025 to FY2026" is unexplained.
    - The sample shows "100%, 35 of 35", next to 17 donors this year.
    - Fixed 2026-10-21: each explanation starts with a plain sentence and names the method
      last. The period reads "comparing fiscal years 2024 and 2025". The 100% came from
      the sample data, which cycled every donor every year. It now covers three years and
      lets some donors stop and others start, so retention shows about 65%.
15. **Phone: explanation boxes don't close on a tap elsewhere.** They stack and cover the
    numbers on iPhone, because they close only on blur.
    Fixed 2026-10-21: a tap anywhere else or Escape closes the box, and only one is open
    at a time.
16. **The board page never says who can see it, or that names are hidden.** Fixed
    2026-10-21: a line under the heading says anyone with the link can see the page, and
    whether donor names are hidden.
17. **Large text on phones:** By fund and Largest gifts scroll sideways, and explanation
    boxes are cut off.
    Fixed 2026-10-21: fund names and amounts wrap above their bar, and Largest gifts rows
    wrap instead of cutting off.

## Minor

- **Landing page.** It gives no description, no "free 30-day trial", and no "set up in
  about 30 minutes". "Sign in" is the main button for new visitors.
- **No welcome after sign-up.** The header shows the email, not the person's name.
- **Time zones.** They read "America/New York". Use "Eastern", and so on.
- **No next step after posting a batch.** Nothing suggests "Thank these donors now".
- **Grammar.** "Post 1 gifts", "1 are new", "See the 1 matched people".
- **Names disagree.**
  - "Clean up" versus "Data health".
  - The Reports area versus its "Reports" tab. The area opens on Board dashboard.
  - "Gift entry standards" versus "Gift entry rules".
- **The merge button is ambiguous.** "Merge Ruth Goldberg into Ruth Goldberg" doesn't say
  which record survives.
- **The rollback message leaves things out.** It omits the funds and campaigns removed.
  Fixed 2026-10-21.
- **Import silently guesses.** A junk row ("Rivera,") becomes a donor, mixed date formats
  are read without a warning, and unknown payment types become "Other".
- **Small tap targets.** Explanation buttons are 20px, and Print is 28px. Aim for 44px.
  Fixed 2026-10-21 for both.
- **Dates and labels on the board page.**
  - The header date is in computer format (2026-10-21).
  - The fiscal year start is never stated.
  - Cards say "this year" while the sentence says "fiscal year".
  - Fixed 2026-10-21: dates read "Oct 21, 2026", the page states when the fiscal year
    started, and cards say "this fiscal year". "0 / 17" now reads "0 new and 17 returning".
- **Printing loses explanations.** Definitions are hidden on print and PDF. Fixed
  2026-10-21: they print as notes at the end of the board dashboard.
- **Turned-off board links.** They show a bare 404 with no explanation. Fixed 2026-10-21:
  a short page says the link was turned off and to ask for a new one.
- **Thank-yous preview.** It shows only the first selected donor.
- **Data health has no single score and no "fix this first" order.**
- **Dana's gift form.**
  - Campaign is required but defaults to "None", and its hint mentions "appeal".
  - "Add a new donor" from the gift form leaves the batch and drops the typed name.
  - Saving a donor despite a strong duplicate match gets no second check, and the warning
    sits above the field being typed in.
- **Board sharing is hard to find.** It sits under Settings, Connections. The Board
  dashboard page mentions board links but has no button for one.
- **Copy link gives no visible "Copied".**
- **Printed statements say "Reply to the email it came with".**
- **Native browser confirm boxes for Remove, Post, and Email.** They look unlike the app
  and are easy to click through.
- **"Remove sample organization" is a large red button at the top of Home.**

## Scenario results

| Persona | Scenario | Result | Confidence (1 to 5) |
|---|---|---|---|
| New ED | Sign up and set up a new organization | Partial: dead ends and misleading progress | 2 |
| Marcus | M1 Import, then roll back | Success | 4 import, 3 rollback |
| Marcus | M2 Duplicates, mark different, undo | Success | 4 |
| Marcus | M3 Data health | Partial | 3 |
| Marcus | M4 Gave last year, not this year, as a spreadsheet | Done, but unusable | 2 |
| Marcus | M5 Thank this week's donors | Partial | 3 |
| Ruth | R1 Open the board link | Success | 4 |
| Ruth | R2 Better or worse than last year | Success | 5 |
| Ruth | R3 What does retention mean | Partial | 2 |
| Ruth | R4 Safe to forward | Partial | 3 |
| Ruth | R5 Does the spreadsheet match | Fail | 1 |
| Dana | D1 Enter a stack of checks | Success | 4 |
| Dana | D2 Make the numbers match the bank | Success, with risk | 3 |
| Dana | D3 Add a donor met at an event (phone) | Success | 4 |
| Dana | D4 Year-end statements | Partial | 3 |
| Dana | D5 Share numbers with the board | Success after searching | 3 |

## What this means for the onboarding wizard

The wizard is where most of the major findings get fixed. It should:

1. **Make Home the guide.** For a new organization, Home is the wizard, not a dashboard of
   zeros. The five main areas stay put, per the navigation standard; only what is on Home
   changes. Home becomes the staff dashboard once there is something to show.
2. **Go in the order things depend on each other.**
   1. The organization's details: EIN, address, and the fiscal year with a plain
      explanation.
   2. Funds: offer two or three starters, such as "General operating", in one click.
   3. Gift rules: accept the recommended rules in one click.
   4. Donors: import, or add a few by hand.
   5. Team.
   6. Thank-you letter: preview it with their EIN, and accept it.
   7. First gift.
3. **Keep the person in the wizard.** Each step is done in place, with Back, Next, and
   "Finish later". No trips into Settings.
4. **Count only real decisions as progress.** Never tick a step because a page was opened.
5. **Ask the import questions up front.**
   - "Were these gifts already thanked?" Default yes for anything older than about 30
     days.
   - "Which of these funds are the same as yours?" Match values, not just columns.
   - Detect the date format once and confirm it.
6. **Finish with proof and a next step.** "You have 412 donors and 3,200 gifts back to
   2019. 3 possible duplicates to check. Rollback is here for 30 days."
7. **Set up the board view properly.** Show what a board link reveals and who can see it,
   explain that comparisons need a year of history, and offer to import last year's
   totals.
8. **Set the defaults that later screens rely on.** Ask for the fiscal year start, and
   explain it in one sentence ("'This year' on Home means since July"). Ask for the current
   campaign, so the gift form is prefilled.
9. **Point to the yearly jobs.** Board sharing during setup, and a Home to-do in January
   for year-end statements, so they are found by task, not by digging in Settings.
10. **Use plain words throughout.** "Deposit" or "group of gifts", not "batch". "Make
   final", not "post". Explain fund, campaign and appeal one at a time, only when needed.

## Fix outside the wizard (smaller, independent)

- **The organization details settings screen** (blocker 1). The backend is done.
- **"Add a fund first" on the gift form** when none exists, with a link (blocker 2).
- **Report date range.** Default to the fiscal year start, and state the range in the file
  and its name (blocker 3).
- **Explanation boxes:** close on a tap outside, and allow only one open at a time (15).
- **The board page:** add a "who can see this" line (16), fix the large-text overflow (17),
  and show a friendly page for a turned-off link.
- **Show gifts that are not yet posted:** in Thank-yous and on the LYBUNT report (10).
- **Mailing columns** in people downloads (11).
- **A "Past imports" list** on the import page and on Data health (12).
- **One name for Data health**, and fixing the Reports tab naming (minor).
- **Refresh the dashboards when a batch is posted (D-a).**
- **Year-end statements:** record what was sent, re-send only to the people not yet sent,
  and offer "download the ones to print" (D-b).
- **Posting:** show "$25.00 short" while working, and use an in-app dialog when it does not
  match, defaulting to "Go back and check" (D-c).
- **Edit a gift in an open batch (D-d).**
- **Consistent "this year":** say "this fiscal year" everywhere, or use one definition
  (D-e).
- **Phone:** scroll padding for the bottom tab bar (D-f).
- **A "Share with your board" button** on the Board dashboard page.
- **The sample data:** make retention believable, not 100%.
