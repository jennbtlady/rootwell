# Phase 2: Clean data

Status: done on 2026-10-20, branch `phase-2/clean-data`.

## What was built

- Tables `duplicate_candidates` and `merge_history`, with RLS and audit.
- `app.scan_duplicates_for()` runs by trigger whenever a constituent or a contact point
  is created or changed, and `app.scan_duplicates(org)` rescans everything (the Scan
  button on the Data health page). `app.score_pair()` shares its rules with the form's
  live check.
- `app.merge_constituents()` and `app.unmerge()` as described below, with tests on a
  messy fixture: three ways of entering the same person, a phone-only match, a
  last-name-and-ZIP match, and two different people who share a last name.
- Screens: Data health (every count links to the list that fixes it), Possible
  duplicates queue with "These are different people", Compare records with per-field
  choices and the survivor choice, Merge history with Undo, a gifts list with filters,
  and filters on the constituent list.

## Verified by hand on 2026-10-20

In the sample organization: a planted duplicate appeared in the queue by trigger, the
compare page showed the differing fields, the merge moved six gifts and a tag onto the
survivor, the history page showed the undo window, and Undo brought the second record
back.

Brief: duplicate scoring on create, a Duplicates queue, side-by-side merge with reversal,
and a Data Health panel.

Done when: importing a deliberately messy fixture yields the expected candidates, a merge
moves all gifts, and the reversal restores both records.

## Task list

1. Data model: `duplicate_candidates` and `merge_history`, RLS, audit.
2. Database functions: `app.scan_duplicates(org)` for the whole org and
   `app.scan_duplicates_for(constituent)` run by trigger on create and on contact
   changes; `app.merge_constituents(survivor, merged, decisions)`;
   `app.unmerge(merge_id)` within 30 days; `app.data_health(org)`.
3. Tests with a messy fixture: expected pairs with reasons, merge moves every gift,
   interaction and relationship, undo restores both records exactly.
4. Core services and API routes, with the route matrix extended.
5. Screens: Data Health panel with each count linking to a filtered list; Duplicates
   queue; merge page with per-field choices; merge history with Undo; a gifts list
   with filters for the health links.

## How a merge works

- Owners and admins merge. Staff see the queue and can mark pairs as not duplicates.
- The survivor keeps its id. For each field that differs, the admin picks a side.
- Gifts, interactions, relationships, pledges and recurring plans move to the survivor,
  always. Emails, phones, addresses and tags are combined; exact repeats are dropped.
- The merged record is deleted and a `merge_history` row keeps a full snapshot: the
  merged record and its child rows, the ids of everything that moved, and the survivor
  as it was. Undo uses that snapshot to put both records back, same ids, for 30 days.
- The audit log records the merge and the undo on both constituents.

## Blocking for the scan

Comparing every pair of constituents by name similarity is too slow past a few thousand
records, so the scan only compares names within a block: same last name, or the same
first three letters of the sort name. Email, phone and last-name-plus-ZIP matches use
indexes and are not blocked.
