"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Input, after Paste's Input and InputBox. A wrapper draws the border as a box
 * shadow (so the focus ring can replace it) and hosts optional prefix and suffix.
 */
export type InputProps = Omit<React.ComponentPropsWithRef<"input">, "prefix" | "size"> & {
  hasError?: boolean;
  /** Text or an icon shown before the value, for example a currency sign. */
  insertBefore?: React.ReactNode;
  /** Text or an icon shown after the value. */
  insertAfter?: React.ReactNode;
};

export function fieldBoxClass(opts: { hasError?: boolean; disabled?: boolean; readOnly?: boolean }) {
  return cn(
    "flex w-full items-stretch rounded-30 bg-background-weakest shadow-border transition-[box-shadow] duration-100 ease-in",
    "hover:shadow-border-primary focus-within:shadow-focus-shadow-border focus-within:hover:shadow-focus-shadow-border",
    opts.hasError && "shadow-border-error hover:shadow-border-error-stronger",
    opts.readOnly && "bg-background hover:shadow-border",
    opts.disabled && "cursor-not-allowed bg-background shadow-border-weak hover:shadow-border-weak focus-within:shadow-border-weak",
  );
}

// 16px (text-40) on phones: iPhone Safari zooms the page into any field under 16px.
export const fieldControlClass =
  "block w-full min-w-0 appearance-none bg-transparent px-3 py-2 text-40 font-medium sm:text-30 leading-5 text-text outline-none placeholder:text-text-weak disabled:cursor-not-allowed disabled:text-text-weaker read-only:text-text-weak";

export function Input({ className, hasError, insertBefore, insertAfter, disabled, readOnly, ...props }: InputProps) {
  return (
    <div className={cn(fieldBoxClass({ hasError, disabled, readOnly }), className)}>
      {insertBefore && <Affix side="before" disabled={disabled}>{insertBefore}</Affix>}
      <input
        className={fieldControlClass}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={hasError || undefined}
        {...props}
      />
      {insertAfter && <Affix side="after" disabled={disabled}>{insertAfter}</Affix>}
    </div>
  );
}

function Affix({ side, disabled, children }: { side: "before" | "after"; disabled?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center bg-background px-3 text-30 leading-5 text-text-weak",
        side === "before" ? "rounded-l-30 border-r border-border-weaker" : "rounded-r-30 border-l border-border-weaker",
        disabled && "text-text-weaker",
      )}
    >
      {children}
    </span>
  );
}
