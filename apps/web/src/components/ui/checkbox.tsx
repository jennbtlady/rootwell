"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "cn";

/**
 * Checkbox after Paste's Checkbox: a 20px box with a 1px border, primary fill when
 * checked, label to the right, optional help text under the label. Native input
 * underneath, so forms, keyboards and screen readers get the real thing.
 */
export type CheckboxProps = Omit<React.ComponentPropsWithRef<"input">, "type"> & {
  label: React.ReactNode;
  help?: React.ReactNode;
};

export function Checkbox({ label, help, className, disabled, id, ...props }: CheckboxProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const helpId = help ? `${inputId}-help` : undefined;
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <span className="relative mt-0.5 inline-flex size-5 shrink-0">
        <input id={inputId} type="checkbox" disabled={disabled} aria-describedby={helpId} className="peer absolute inset-0 size-5 cursor-pointer appearance-none rounded-20 bg-background-weakest shadow-border outline-none transition-[box-shadow,background-color] hover:shadow-border-primary checked:bg-background-primary checked:shadow-border-primary focus-visible:shadow-focus disabled:cursor-not-allowed disabled:bg-background disabled:shadow-border-weak disabled:checked:bg-background-strong" {...props} />
        <Check className="pointer-events-none absolute inset-0 m-auto size-3.5 text-text-inverse opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden="true" />
      </span>
      <span className="flex flex-col">
        <label htmlFor={inputId} className={cn("text-30 font-medium leading-5", disabled ? "cursor-not-allowed text-text-weak" : "cursor-pointer text-text")}>
          {label}
        </label>
        {help && (
          <span id={helpId} className="text-30 leading-5 text-text-weak">
            {help}
          </span>
        )}
      </span>
    </div>
  );
}
