"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { fieldBoxClass, fieldControlClass } from "./input";

/** Native select styled like Input, after Paste's Select. Options are plain <option>s. */
export type SelectProps = React.ComponentPropsWithRef<"select"> & { hasError?: boolean };

export function Select({ className, hasError, disabled, children, ...props }: SelectProps) {
  return (
    <div className={cn(fieldBoxClass({ hasError, disabled }), "relative", className)}>
      <select className={cn(fieldControlClass, "cursor-pointer pr-9 disabled:cursor-not-allowed")} disabled={disabled} aria-invalid={hasError || undefined} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" className={cn("pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-text-icon", disabled && "text-text-weaker")} />
    </div>
  );
}
