import * as React from "react";
import { cn } from "@/lib/cn";
import { HelpText } from "./help-text";
import { Label } from "./label";

/**
 * Label + control + help or error text, wired together with ids so screen readers
 * read the help and error with the field. Paste composes these by hand; this keeps
 * every form in the app consistent.
 */
export type FormFieldProps = {
  id: string;
  label: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  disabled?: boolean;
  help?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  /** Receives the ids to spread onto the control. */
  children: (field: { id: string; "aria-describedby": string | undefined; "aria-invalid": true | undefined; hasError: boolean }) => React.ReactNode;
};

export function FormField({ id, label, required, optional, disabled, help, error, className, children }: FormFieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col", className)}>
      <Label htmlFor={id} required={required} optional={optional} disabled={disabled}>
        {label}
      </Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, hasError: Boolean(error) })}
      {error && (
        <HelpText id={errorId} variant="error">
          {error}
        </HelpText>
      )}
      {help && <HelpText id={helpId}>{help}</HelpText>}
    </div>
  );
}
