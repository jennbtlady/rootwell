import * as React from "react";
import { cn } from "cn";

/** Body copy after Paste's Paragraph: 14px on a 24px line, with a paragraph margin. */
export function Paragraph({ className, noMargin, ...props }: React.ComponentPropsWithRef<"p"> & { noMargin?: boolean }) {
  return <p className={cn("text-30 leading-6 text-text", !noMargin && "mb-6", className)} {...props} />;
}

/** In-content link styling after Paste's Anchor. Use with next/link or <a>. */
export const anchorClass =
  "rounded-10 text-text-link underline underline-offset-2 outline-none transition-colors hover:text-text-link-stronger focus-visible:shadow-focus";
