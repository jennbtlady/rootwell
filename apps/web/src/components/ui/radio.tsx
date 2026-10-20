"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/** Radio after Paste's Radio. Group them with <RadioGroup legend="...">. */
export type RadioProps = Omit<React.ComponentPropsWithRef<"input">, "type"> & { label: React.ReactNode; help?: React.ReactNode };

export function Radio({ label, help, className, disabled, id, ...props }: RadioProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const helpId = help ? `${inputId}-help` : undefined;
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <span className="relative mt-0.5 inline-flex size-5 shrink-0">
        <input id={inputId} type="radio" disabled={disabled} aria-describedby={helpId} className="peer absolute inset-0 size-5 cursor-pointer appearance-none rounded-circle bg-background-weakest shadow-border outline-none transition-[box-shadow] hover:shadow-border-primary checked:shadow-border-primary focus-visible:shadow-focus disabled:cursor-not-allowed disabled:bg-background disabled:shadow-border-weak" {...props} />
        <span className="pointer-events-none absolute inset-0 m-auto size-2.5 rounded-circle bg-background-primary opacity-0 peer-checked:opacity-100 peer-disabled:bg-background-strong" aria-hidden="true" />
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

export function RadioGroup({ legend, help, required, className, children, ...props }: React.ComponentPropsWithRef<"fieldset"> & { legend: React.ReactNode; help?: React.ReactNode; required?: boolean }) {
  return (
    <fieldset className={cn("flex flex-col gap-2", className)} {...props}>
      <legend className="mb-1 flex items-start gap-1 text-30 font-medium leading-5 text-text">
        {required && (
          <span className="mt-[7px] inline-block size-1.5 shrink-0 rounded-full bg-background-required">
            <span className="sr-only">Required, </span>
          </span>
        )}
        {legend}
      </legend>
      {children}
      {help && <p className="text-30 leading-5 text-text-weak">{help}</p>}
    </fieldset>
  );
}
