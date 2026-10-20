import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/** Badge after Paste's Badge: short status words, never a button. */
export const badgeVariants = cva("inline-flex max-w-max items-center gap-1 rounded-20 px-2 py-1 text-20 font-semibold leading-4", {
  variants: {
    variant: {
      default: "bg-background-body text-text shadow-border-weaker",
      neutral: "bg-background-neutral-weakest text-text-neutral shadow-border-neutral-weaker",
      success: "bg-background-success-weakest text-text-success shadow-border-success-weaker",
      error: "bg-background-error-weakest text-text-error shadow-border-error-weaker",
      warning: "bg-background-warning-weakest text-text-warning shadow-border-warning-weaker",
      new: "bg-background-new-weakest text-text-new shadow-border-new-weaker",
      decorative10: "bg-background-decorative-10-weakest text-text-decorative-10 shadow-border-decorative-10-weaker",
      decorative20: "bg-background-decorative-20-weakest text-text-decorative-20 shadow-border-decorative-20-weaker",
      decorative30: "bg-background-decorative-30-weakest text-text-decorative-30 shadow-border-decorative-30-weaker",
      decorative40: "bg-background-decorative-40-weakest text-text-decorative-40 shadow-border-decorative-40-weaker",
      neutral_counter: "rounded-pill bg-background-neutral-weakest text-text-neutral shadow-border-neutral-weaker",
      error_counter: "rounded-pill bg-background-error-weakest text-text-error shadow-border-error-weaker",
    },
  },
  defaultVariants: { variant: "default" },
});

export type BadgeProps = React.ComponentPropsWithRef<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
