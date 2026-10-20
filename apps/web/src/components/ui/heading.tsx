import * as React from "react";
import { cn } from "@/lib/cn";

/** Headings after Paste's Heading: six visual sizes, each with a default element. */
export type HeadingVariant = "heading10" | "heading20" | "heading30" | "heading40" | "heading50" | "heading60";

const STYLE: Record<HeadingVariant, { as: "h1" | "h2" | "h3" | "h4" | "h5" | "h6"; className: string }> = {
  heading10: { as: "h1", className: "text-90 mb-6" },
  heading20: { as: "h2", className: "text-70 mb-5" },
  heading30: { as: "h3", className: "text-60 mb-4" },
  heading40: { as: "h4", className: "text-40 mb-2" },
  heading50: { as: "h5", className: "text-30 mb-2" },
  heading60: { as: "h6", className: "text-20 mb-2" },
};

export type HeadingProps = React.ComponentPropsWithRef<"h1"> & {
  variant?: HeadingVariant;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  noMargin?: boolean;
};

export function Heading({ variant = "heading20", as, noMargin, className, ...props }: HeadingProps) {
  const style = STYLE[variant];
  const Tag = as ?? style.as;
  return <Tag className={cn("font-semibold tracking-[-0.02em] text-text", style.className, noMargin && "mb-0", className)} {...props} />;
}
