# Navigation Standard for Non-Technical Users

Oct 20, 2026 · @Jenn

## How to use this document

This is a binding standard for every screen that has navigation. Read it before generating or changing any nav, sidebar, tab row, menu, or page header. When a request conflicts with this standard, follow the standard and flag the conflict in your summary instead of silently complying.

The audience for the product is non-technical. Assume the person using it opens the app a few times a month, does not read documentation, and relies on what is visible on screen. Every rule below exists to keep that person oriented and able to finish a task without guessing.

If a screen already exists, preserve its navigation structure, labels, and placement unless the request explicitly asks to change them. Do not introduce a new navigation layer to solve a layout problem.

## Core principles

Six rules govern every navigation decision. They are ordered by priority; when two conflict, the earlier one wins.

1. **Organize by what people do, not by what the system contains.** Primary destinations are the tasks people come to accomplish, named as they would name them. Never mirror the data model, the database tables, the org chart, or the feature list.
2. **Three to five primary destinations.** Five is the ceiling. If the product needs more, the information architecture is wrong, not the nav component. Push the rest into a More or overflow area, or merge destinations.
3. **Visible beats hidden.** Primary navigation is always on screen. Nothing a person needs to find their way lives behind an icon, a swipe, or a hover. Hidden navigation costs novices the mental map of the product.
4. **Shallow.** Three levels deep at most, counting the primary destination as level one. If a screen needs a fourth level, restructure the content instead of adding nesting.
5. **Convention over novelty.** Use the platform's standard pattern (bottom tab bar on mobile, left sidebar or top bar on desktop). Non-technical users carry muscle memory from the apps they already use. A clever navigation pattern is a usability defect for this audience.
6. **Progressive disclosure.** Show the few things most people need first. Advanced, rare, or administrative options appear only when someone asks for them, through a clearly labeled control. Appearing on the first screen is a signal of importance; do not spend that signal on secondary features.

## Decision: separate sides of the app (Jenn, 2026-11-12)

Rootwell has two sides: the CRM and Fundraising. They are treated as two products in one app,
the way Gmail and Calendar are two products. A switch with two visible, labeled tabs ("CRM" and
"Fundraising") sits in the header beside the organization's name. It is not an icon, a grid or
a menu.

- Each side has its own primary destinations, five at most, and the three-level rule applies
  inside each side. The switch itself is not counted as a level.
- Where the sides meet, they link to each other. Every online gift and every fundraiser is a
  donor in the CRM, so nobody has to guess where a record lives.
- An organization without Fundraising sees no switch.
- A future third side (for example a Board side) joins the same switch, under the same rules.
