# @maple/design

Design tokens for Maple Ledger, sourced from Twilio Paste (`@twilio-paste/design-tokens`).

- `tokens.css`: generated. Paste's default theme on `:root`, dark theme under `.dark`. Every token is a CSS custom property with Paste's own name, for example `--color-background-primary`, `--space-50`, `--font-size-30`, `--shadow-focus`.
- `pnpm --filter @maple/design build:tokens` regenerates it after upgrading the package.

The web app maps these onto Tailwind in `apps/web/src/app/globals.css`. The rules for using them are in `docs/design-system.md`.
