import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Headings after Paste's Heading: six visual sizes, each with a default element.
 * Titles (10 to 40) use Fredoka Medium, the logo's lettering. The two smallest sizes are
 * labels and stay in Inter, which reads better at 12 to 14px.
 */
export type HeadingVariant = "heading10" | "heading20" | "heading30" | "heading40" | "heading50" | "heading60";

const STYLE: Record<HeadingVariant, { as: "h1" | "h2" | "h3" | "h4" | "h5" | "h6"; className: string }> = {
  heading10: { as: "h1", className: "font-display font-medium tracking-normal text-90 mb-6" },
  heading20: { as: "h2", className: "font-display font-medium tracking-normal text-70 mb-5" },
  heading30: { as: "h3", className: "font-display font-medium tracking-normal text-60 mb-4" },
  heading40: { as: "h4", className: "font-display font-medium tracking-normal text-40 mb-2" },
  heading50: { as: "h5", className: "font-semibold tracking-[-0.02em] text-30 mb-2" },
  heading60: { as: "h6", className: "font-semibold tracking-[-0.02em] text-20 mb-2" },
};

export type HeadingProps = React.ComponentPropsWithRef<"h1"> & {
  variant?: HeadingVariant;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  noMargin?: boolean;
};

export function Heading({ variant = "heading20", as, noMargin, className, ...props }: HeadingProps) {
  const style = STYLE[variant];
  const Tag = as ?? style.as;
  return <Tag className={cn("text-text", style.className, noMargin && "mb-0", className)} {...props} />;
}
