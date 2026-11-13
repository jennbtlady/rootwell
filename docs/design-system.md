# Design system

Decision (Jenn, 2026-10-20): Rootwell's design system is built on Twilio Paste's design
tokens and component anatomy. The components are our own, in this repo. We do not use
Paste's React library at runtime.

Why tokens and not components: Paste's components are built on Emotion, which would make
every piece of UI a client component in Next.js, and they cannot be shared with the Expo
app. Its tokens are plain values that both apps can read, and its guidelines are good.

## Where things live

| What | Where |
|---|---|
| Token source | `@twilio-paste/design-tokens` (MIT), a dev dependency of `packages/design` |
| Generated stylesheets | `packages/design/tokens.css` (every token as `--paste-*`, light on `:root`, dark under `.dark`) and `packages/design/theme.css` (a Tailwind `@theme` block) |
| Design changes | `packages/design/overrides.css`: redefine any `--paste-*` token there and every component follows |
| Regenerate after upgrading | `pnpm --filter @maple/design build:tokens` |
| Components | `apps/web/src/components/ui/`, exported from `@/components/ui` |
| Living style guide | `/design` in the web app |
| Fonts | Inter for body, labels and numbers (`--font-inter`). Fredoka Medium for titles (`--font-fredoka`, the `font-display` class), the logo's lettering (Jenn, 2026-10-21). Heading sizes 10 to 40 use Fredoka; 50 and 60 are labels and stay Inter. Both load through `next/font`. |

## How Paste names become Tailwind classes

The theme exposes tokens under Paste's own names, so a line of Paste source maps to a
class one to one. When porting a component, read its source in the Paste repository
(`packages/paste-core/components/<name>/src`) and translate:

| Paste source | Tailwind class |
|---|---|
| `backgroundColor="colorBackgroundPrimary"` | `bg-background-primary` |
| `color="colorTextWeak"` | `text-text-weak` |
| `borderColor="colorBorderWeaker"` | `border-border-weaker` |
| `boxShadow="shadowBorderWeak"` | `shadow-border-weak` |
| `boxShadow="shadowFocus"` | `shadow-focus` (on `focus-visible:`) |
| `borderRadius="borderRadius30"` | `rounded-30` |
| `fontSize="fontSize30"` (+ `lineHeight30`) | `text-30` (sets both) |
| `lineHeight="lineHeight20"` alone | `leading-20` |
| `fontWeight="fontWeightSemibold"` | `font-semibold` |
| `padding="space50"` | `p-4` (Paste's scale is 4px like Tailwind's: 20 = 1, 30 = 2, 40 = 3, 50 = 4, 60 = 5, 70 = 6, 90 = 8, 100 = 9, 130 = 12) |
| `size="sizeIcon20"` | `size-5` (icon sizes: 10 = 4, 20 = 5, 30 = 5, 40 = 6) |

Borders on fields and buttons are box shadows, as in Paste, so the focus ring can replace
them without a layout shift.

## Brand colors

Decision (Jenn, 2026-10-21): a five-color palette, set in `packages/design/overrides.css`.
Three colors needed small changes to pass WCAG AA, and those are what the app uses.

| Color | Role | Rule |
|---|---|---|
| Crimson Violet #500030 | Primary buttons, links, focus ring, selected states, chart "this year" | Passes everywhere: white on it 15.2:1, on the page 14.5:1. Hover and pressed go deeper (#3A0023), never lighter. |
| Air Force Blue #638494 | Decoration only, such as the chart's "last year" bars | Fails for normal text (white on it 3.99:1). When it carries text, as in information alerts, use **#567280** (5.1:1 with white, 4.9:1 on the page). |
| Lime Cream #CBEC89 | Light highlight backgrounds: "New" badges, the sample notice (as the tint #EEF8DA) | Background only, with Crimson or dark text. Never text, icons or borders that must be seen. |
| Cherry Blossom #FFA6B5 | Light highlight backgrounds: pressed and selected tints (#FCE8EC, #FFD3DB) | Background only. Too pale for text, borders or icons. |
| Lime Mist #F8FCE6 | Page background (Jenn, 2026-11-13; it was Old Lace #F8F1E2) | Cards and fields stay white and keep their border (white on the page is only 1.05:1). |

Supporting colors chosen to pass on the page and on white:

| Token | Value | Check |
|---|---|---|
| Body text | #2A1A22 | 15.8:1 on the page |
| Weak text, icons | #645A5E | 6.3:1 on the page, 6.6:1 on white |
| Field borders | #8F7F86 | 3.6:1 on the page, 3.8:1 on white (fields need 3:1) |
| Error | #C2001F | 6.0:1 on the page (Paste's #DB132A was 4.51:1) |
| Focus ring | Crimson at 70% | 6.3:1 on the page |

Lime reads as "good" and pink as "bad" to many people, so neither is used for status.
Success, warning and error keep their own colors, and always come with an icon and words.
The app icon and the phone browser bar use Crimson Violet. The Stripe stand-in pages keep
Stripe's blue on purpose, because they imitate Stripe.

Charts use `--paste-color-data-visualization-1` (#8E2A63, a lighter plum, for "this
year") and `-2` (Air Force Blue #638494, for "last year"). Crimson Violet itself is
darker than the dataviz validator's band for chart fills, so the plum is used there.
The pair passes color-blind separation (13.2) and normal-vision separation (22.2). Air
Force Blue reads as a muted color, which suits its job as the "context" series. Charts
also name series in words, so color is never the only cue.

**Logo (Jenn, 2026-10-21).** The full Rootwell logo is Jenn's artwork,
`public/brand/rootwell-logo.png` (600 by 175, transparent), shown by
`components/brand/logo.tsx` in three sizes on the header, sign-in pages and landing page.
Its alt text is "Rootwell", because the image carries the name. Do not re-set the name in
type beside the mark; use the logo file. The mark alone (a lime heart of roots with a pink
bud) is `public/brand/rootwell-mark.svg`, cropped from Jenn's `rootwell_icon.svg`, for
square spaces.

The app icons (browser tab, home screen, iPhone) put the mark on a Crimson Violet tile,
where its pale colors stand out. The home-screen version has extra margin for phones
that crop icons into circles. The PNGs are rendered from the SVGs. The pale mark on Old
Lace is soft (about 1.2:1), which is fine for a logo: WCAG exempts logotypes, and the name
carries the brand.

To change a color, edit `overrides.css`, rerun the contrast checks for every pair it
touches, and run the browser suite, which scans every page with axe.

## Components

| Component | After Paste | Notes |
|---|---|---|
| `Button` | Button | `primary`, `secondary`, `destructive`, `destructive_secondary`, `link`, `destructive_link`; sizes `default`, `small`, `icon`, `icon_small`; `loading` shows a spinner and sets `aria-busy`. `buttonVariants()` styles a `Link` (primary or secondary only). |
| `Input`, `Textarea`, `Select` | Input, TextArea, Select | `hasError`, `disabled`, `readOnly`; `insertBefore` / `insertAfter` for prefixes like `$`. Select is the native element with a chevron. |
| `Label` | Label | `required` shows the red dot with "Required" for screen readers; `optional` adds "(optional)". |
| `HelpText` | HelpText | `default`, `error`, `success`, `warning`. Error text says what to do. |
| `FormField` | (composition) | Wires label, control, help and error ids. Use it for every field. |
| `Heading` | Heading | `heading10` to `heading60`, each with a default element; `as` overrides. |
| `Paragraph`, `anchorClass` | Paragraph, Anchor | Body text and in-content links. |
| `Card` and parts | Card | 24px padding on phones, 36px above (Paste pads 36px everywhere). |
| `Alert` and parts | Alert | `neutral` (status), `error` and `warning` (alert). Page-level messages only. |
| `Badge` | Badge | Status words. Never clickable. |
| `Spinner` | Spinner | Pass `label` when it should be announced. |
| `useConfirm`, `ConfirmHost` | Modal | The app's own "are you sure?" box. Never use the browser's `confirm()`. Focus starts on the safe choice; `destructive` makes the confirm button red. The app layout mounts the host. |
| `CopyButton` | Button | Copies text and says "Copied" on the button for three seconds. Says to copy by hand if the browser blocks it. |

Not yet ported, in the order Phase 1 will need them: Table, Pagination, Tabs, Modal,
Menu, Combobox, Toast, Date picker, Checkbox, Radio, Switch, Skeleton, Empty state. Use
Base UI (`@base-ui/react`, already installed) for keyboard and focus behavior of menus,
dialogs and comboboxes, with Paste's look on top.

## Merging classes

Use `cn()` from `@/lib/cn`, never a generic helper. It is tailwind-merge taught the Paste
theme from `packages/design/theme.json`, which the token generator writes. A generic
tailwind-merge reads `text-text-inverse` as a font size and silently drops it next to
`text-30`, which once left every primary button with dark text on blue. A unit test in
`apps/web/test/cn.test.ts` guards this.

## Rules

1. Use the components. Reach for raw Tailwind only for layout (flex, grid, gaps).
2. Colors come from the roles above, never from Tailwind's palette or hex values.
3. Text sizes come from the Paste scale (`text-20` to `text-110`), not `text-sm` and friends.
4. One primary button per screen. Buttons act on this page; links go somewhere.
5. Every field uses `FormField`, so help and errors are announced with the field.
6. Focus is a 4px blue ring (`shadow-focus`) on every interactive element. Never remove it.
7. Status needs a word, not just a color.
8. Copy: plain, short, no jargon a volunteer treasurer would not know. Error text names the fix. No em dashes.
9. Phone first. Check every screen at 375px before calling it done.
10. Dark mode exists in the tokens (`.dark`) but no screen is designed for it yet. Do not add a toggle until that work is scheduled.

## Public pages (fundraising Phase 1)

Admin screens use the Rootwell palette above. Public pages (giving pages now; fundraiser and
event pages later) carry each nonprofit's own brand instead.

- `PublicShell` (`apps/web/src/components/give/public-shell.tsx`) frames every public page:
  header image, logo and name, the content, and a small "Powered by Rootwell" at the foot.
- `brandStyle()` (`apps/web/src/lib/brand.ts`) redefines the primary tokens on that wrapper
  only, so every `Button`, link and focus ring inside follows the organization's colors. It is
  the one place outside `overrides.css` that sets tokens, because the values come from each
  organization at runtime. Text on a primary button switches between white and near-black,
  whichever reads better (`textOn()` in `packages/core/src/branding.ts`).
- `--brand-accent` carries the accent color for progress bars and highlights.
- The settings preview renders `PublicShell` itself, so it always matches the real page.
- Contrast: `brandingWarnings()` warns when the main color is under 4.5:1 for links on white or
  for button text, and when the accent is under 3:1 on white. Saving is still allowed.

## Mobile app

Phase 7's Expo app reads the same token values. `tokens.css` is the source; a small script
can emit a JSON or TypeScript map for NativeWind from the same package when that phase
starts.
