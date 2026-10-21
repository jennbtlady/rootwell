# Design system

Decision (Jenn, 2026-10-20): Maple Ledger's design system is built on Twilio Paste's design
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
| Font | Inter, loaded through `next/font` as `--font-inter` |

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
| Crimson Violet #500030 | Primary buttons, links, focus ring, selected states, chart "this year" | Passes everywhere: white on it 15.2:1, on Old Lace 13.5:1. Hover and pressed go deeper (#3A0023), never lighter. |
| Air Force Blue #638494 | Decoration only, such as the chart's "last year" bars | Fails for normal text (white on it 3.99:1). When it carries text, as in information alerts, use **#567280** (5.1:1 with white, 4.5:1 on Old Lace). |
| Lime Cream #CBEC89 | Light highlight backgrounds: "New" badges, the sample notice (as the tint #EEF8DA) | Background only, with Crimson or dark text. Never text, icons or borders that must be seen. |
| Cherry Blossom #FFA6B5 | Light highlight backgrounds: pressed and selected tints (#FCE8EC, #FFD3DB) | Background only. Too pale for text, borders or icons. |
| Old Lace #F8F1E2 | Page background | Cards and fields stay white and keep their border (white on Old Lace is only 1.12:1). |

Supporting colors chosen to pass on Old Lace and white:

| Token | Value | Check |
|---|---|---|
| Body text | #2A1A22 | 14.7:1 on Old Lace |
| Weak text, icons | #645A5E | 5.9:1 on Old Lace, 6.6:1 on white |
| Field borders | #8F7F86 | 3.4:1 on Old Lace, 3.8:1 on white (fields need 3:1) |
| Error | #C2001F | 5.6:1 on Old Lace (Paste's #DB132A was 4.51:1) |
| Focus ring | Crimson at 70% | 6.1:1 on Old Lace |

Lime reads as "good" and pink as "bad" to many people, so neither is used for status.
Success, warning and error keep their own colors, and always come with an icon and words.
The app icon and the phone browser bar use Crimson Violet. The Stripe stand-in pages keep
Stripe's blue on purpose, because they imitate Stripe.

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

## Mobile app

Phase 7's Expo app reads the same token values. `tokens.css` is the source; a small script
can emit a JSON or TypeScript map for NativeWind from the same package when that phase
starts.
