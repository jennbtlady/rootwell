import * as React from "react";
import { cn } from "cn";

/**
 * Label, after Paste's Label. Required fields get a small red dot, not an asterisk,
 * with "Required" read to screen readers. Optional fields can say so instead.
 */
export type LabelProps = React.ComponentPropsWithRef<"label"> & {
  required?: boolean;
  optional?: boolean;
  disabled?: boolean;
};

export function Label({ className, required, optional, disabled, children, ...props }: LabelProps) {
  return (
    <label
      className={cn("mb-1 flex items-start gap-1 text-30 font-medium leading-5", disabled ? "cursor-not-allowed text-text-weak" : "cursor-pointer text-text", className)}
      {...props}
    >
      {required && (
        <span className="mt-[7px] inline-block size-1.5 shrink-0 rounded-full bg-background-required" aria-hidden="false">
          <span className="sr-only">Required, </span>
        </span>
      )}
      <span>
        {children}
        {optional && <span className="ml-1 italic text-text-weak">(optional)</span>}
      </span>
    </label>
  );
}
