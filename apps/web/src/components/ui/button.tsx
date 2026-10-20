import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Spinner } from "./spinner";

/**
 * Button, after Paste's button. Variants and states follow Paste's token choices:
 *   primary, secondary, destructive, destructive_secondary, link, destructive_link.
 * Use a Button for actions on this page and an Anchor (or Link with
 * buttonVariants) to go somewhere. Only primary and secondary may style a link.
 */
export const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap select-none",
    "border-0 outline-none transition-[background-color,box-shadow,color] duration-100 ease-in",
    "focus-visible:shadow-focus disabled:cursor-not-allowed aria-busy:cursor-wait",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-background-primary text-text-inverse shadow-border-primary",
          "hover:bg-background-weakest hover:text-text-primary",
          "active:bg-background-primary-weakest active:text-text-primary-strong active:shadow-border-primary-strong",
          "disabled:bg-background-strong disabled:text-text-weakest disabled:shadow-border-weaker",
          "aria-busy:bg-background-body aria-busy:text-text-weaker aria-busy:shadow-border-weaker",
        ],
        secondary: [
          "bg-background-weakest text-text shadow-border-weak",
          "hover:text-text-primary hover:shadow-border-primary focus-visible:shadow-focus-shadow-border",
          "active:bg-background-primary-weakest active:text-text-primary-strong active:shadow-border-primary-strong",
          "disabled:bg-background-body disabled:text-text-weaker disabled:shadow-border-weaker disabled:hover:text-text-weaker",
          "aria-busy:bg-background-body aria-busy:text-text-weaker aria-busy:shadow-border-weaker",
        ],
        destructive: [
          "bg-background-destructive text-text-inverse shadow-border-destructive",
          "hover:bg-background-body hover:text-text-destructive",
          "active:bg-background-destructive-weakest active:text-text-destructive",
          "disabled:bg-background-strong disabled:text-text-weakest disabled:shadow-border-weaker",
          "aria-busy:bg-background-body aria-busy:text-text-weaker aria-busy:shadow-border-weaker",
        ],
        destructive_secondary: [
          "bg-background-weakest text-text-destructive shadow-border-weak",
          "hover:shadow-border-destructive focus-visible:shadow-focus-shadow-border",
          "active:bg-background-destructive-weakest active:shadow-border-destructive",
          "disabled:bg-background-body disabled:text-text-weaker disabled:shadow-border-weaker disabled:hover:shadow-border-weaker",
          "aria-busy:bg-background-body aria-busy:text-text-weaker aria-busy:shadow-border-weaker",
        ],
        link: [
          "bg-transparent text-text-primary text-left transition-none",
          "hover:text-text-primary-strongest hover:underline active:underline",
          "disabled:text-text-weaker disabled:no-underline aria-busy:text-text-weaker",
        ],
        destructive_link: [
          "bg-transparent text-text-destructive text-left transition-none",
          "hover:text-text-destructive-strongest hover:underline active:underline",
          "disabled:text-text-weaker disabled:no-underline aria-busy:text-text-weaker",
        ],
      },
      size: {
        default: "rounded-30 px-3 py-2 text-30 leading-5",
        small: "rounded-30 px-2 py-1 text-30 leading-5",
        icon: "rounded-30 p-2",
        icon_small: "rounded-30 p-1",
      },
      fullWidth: { true: "w-full", false: "" },
    },
    compoundVariants: [
      { variant: ["link", "destructive_link"], className: "rounded-20" },
    ],
    defaultVariants: { variant: "primary", size: "default", fullWidth: false },
  },
);

export type ButtonProps = React.ComponentPropsWithRef<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner and blocks clicks while an action is in flight. */
    loading?: boolean;
  };

export function Button({ className, variant, size, fullWidth, loading = false, disabled, children, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner label="Loading" />}
      {children}
    </button>
  );
}
