# Design system

Decision (Jenn, 2026-10-20): the product's design system is to be built on Twilio's Paste
(https://github.com/twilio-labs/paste), not left as shadcn/ui defaults.

Status: noted, not started. The Phase 0 screens use shadcn/ui (base-nova preset) as a
placeholder. Nothing in those screens is styled in a way that would be hard to replace.

## What to decide when this starts

- Adopt Paste directly (its React components and tokens, which bring their own theming
  and accessibility work), or adopt Paste's tokens, spacing scale, type scale and
  component patterns on top of Tailwind and the existing components. Paste is built on
  its own styling system, so mixing it with Tailwind needs a clear boundary.
- Which Paste theme is the base, and how the Maple Ledger palette maps onto its tokens.
- The mobile app (Phase 7) uses NativeWind. Shared tokens must be expressible as plain
  values (colors, spacing, type) so both apps read the same source.
- Accessibility is a strength of Paste. Keep its focus, contrast and keyboard behavior
  intact rather than restyling over them.

## Where it lands in the plan

Best slot: the start of Phase 1, before the constituent and gift screens exist, so the
form patterns (which Phase 1 is full of) are built on the final system once.
