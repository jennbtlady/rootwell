import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import theme from "@maple/design/theme.json";

/**
 * Class merging that knows the Paste theme. tailwind-merge only knows Tailwind's
 * default names, so without this it reads `text-text-inverse` as a font size and drops
 * it when `text-30` is present. The names come from the same generator as theme.css.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: theme.color,
      text: theme.text,
      leading: theme.leading,
      radius: theme.radius,
      shadow: theme.shadow,
    },
  },
  // Paste names shadows after what they draw ("border-weak"), which also look like
  // colors. We never use Tailwind's shadow-color utilities, so turn that group off and
  // let every shadow-* class resolve as a box shadow.
  override: { classGroups: { "shadow-color": [] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
