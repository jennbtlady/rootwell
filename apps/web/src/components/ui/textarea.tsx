"use client";

import * as React from "react";
import { cn } from "cn";
import { fieldBoxClass, fieldControlClass } from "./input";

export type TextareaProps = React.ComponentPropsWithRef<"textarea"> & { hasError?: boolean };

export function Textarea({ className, hasError, disabled, readOnly, rows = 3, ...props }: TextareaProps) {
  return (
    <div className={cn(fieldBoxClass({ hasError, disabled, readOnly }), className)}>
      <textarea
        className={cn(fieldControlClass, "resize-y")}
        rows={rows}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={hasError || undefined}
        {...props}
      />
    </div>
  );
}
