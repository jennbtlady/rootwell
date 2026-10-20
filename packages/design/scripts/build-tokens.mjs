// Generates two stylesheets from Twilio Paste's design tokens.
//
//   tokens.css  every Paste token as a CSS custom property with a --paste- prefix,
//               default theme on :root and dark theme under .dark
//   theme.css   a Tailwind v4 @theme block that exposes those tokens as utilities
//               under Paste's own names, so Paste source maps to classes one to one:
//               colorBackgroundPrimary -> bg-background-primary
//               colorTextWeak          -> text-text-weak
//               shadowBorderWeak       -> shadow-border-weak
//               borderRadius30         -> rounded-30
//               fontSize30/lineHeight30-> text-30
//
// Rerun after upgrading @twilio-paste/design-tokens: pnpm --filter @maple/design build:tokens
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("@twilio-paste/design-tokens/package.json"));
const version = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;

function readTokens(file) {
  const css = readFileSync(file, "utf8");
  const body = css.slice(css.indexOf("{") + 1, css.lastIndexOf("}"));
  const out = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("--")) continue;
    const i = line.indexOf(":");
    out.push([line.slice(2, i).trim(), line.slice(i + 1).replace(/;$/, "").trim()]);
  }
  return out;
}

const light = readTokens(join(pkgDir, "dist/tokens.custom-properties.css"));
const dark = readTokens(join(pkgDir, "dist/themes/dark/tokens.custom-properties.css"));

const header = `/* Generated from @twilio-paste/design-tokens ${version} by scripts/build-tokens.mjs. Do not edit. */`;

const vars = (pairs) => pairs.map(([k, v]) => `  --paste-${k}: ${v};`).join("\n");
writeFileSync(new URL("../tokens.css", import.meta.url), `${header}\n:root {\n${vars(light)}\n}\n\n.dark {\n${vars(dark)}\n}\n`);

// Tailwind theme. Only namespaces Tailwind understands; spacing stays on Tailwind's
// own 4px scale, which matches Paste's (space-50 = 16px = p-4).
const theme = [];
const lineHeights = new Map();
for (const [k] of light) if (k.startsWith("line-height-")) lineHeights.set(k.slice("line-height-".length), k);
for (const [k] of light) {
  if (k.startsWith("color-")) theme.push(`  --color-${k.slice(6)}: var(--paste-${k});`);
  else if (k === "shadow") theme.push(`  --shadow-paste: var(--paste-${k});`);
  else if (k.startsWith("shadow-")) theme.push(`  --shadow-${k.slice(7)}: var(--paste-${k});`);
  else if (k.startsWith("border-radius-")) theme.push(`  --radius-${k.slice(14)}: var(--paste-${k});`);
  else if (k.startsWith("font-size-") && k !== "font-size-base") {
    const n = k.slice(10);
    theme.push(`  --text-${n}: var(--paste-${k});`);
    if (lineHeights.has(n)) theme.push(`  --text-${n}--line-height: var(--paste-${lineHeights.get(n)});`);
  } else if (k.startsWith("line-height-")) theme.push(`  --leading-${k.slice(12)}: var(--paste-${k});`);
  else if (k.startsWith("z-index-")) theme.push(`  --z-index-${k.slice(8)}: var(--paste-${k});`);
}
writeFileSync(new URL("../theme.css", import.meta.url), `${header}\n@theme inline {\n${theme.join("\n")}\n}\n`);

console.log(`tokens.css (${light.length} tokens) and theme.css (${theme.length} entries) written from design-tokens ${version}`);
