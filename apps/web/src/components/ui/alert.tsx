import * as React from "react";
import { CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Alert after Paste's Alert. Neutral announces politely (status); error and warning
 * interrupt (alert). Use it for page-level messages. Field errors use HelpText.
 */
export type AlertProps = React.ComponentPropsWithRef<"div"> & {
  variant?: "neutral" | "error" | "warning";
  onDismiss?: () => void;
};

const VARIANT = {
  neutral: { role: "status", className: "border-border-neutral-weaker bg-background-neutral-weakest text-text-neutral", Icon: Info, icon: "text-text-icon-neutral", label: "Information" },
  error: { role: "alert", className: "border-border-error-weaker bg-background-error-weakest text-text-error", Icon: CircleAlert, icon: "text-text-icon-error", label: "Error" },
  warning: { role: "alert", className: "border-border-warning-weaker bg-background-warning-weakest text-text-warning-strong", Icon: TriangleAlert, icon: "text-text-icon-warning", label: "Warning" },
} as const;

export function Alert({ className, variant = "neutral", onDismiss, role, children, ...props }: AlertProps) {
  const v = VARIANT[variant];
  return (
    <div role={role ?? v.role} className={cn("flex gap-3 rounded-30 border p-4 text-30 leading-5", v.className, className)} {...props}>
      <v.Icon className={cn("mt-px size-5 shrink-0", v.icon)} aria-hidden="false" role="img" aria-label={v.label} />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="-m-1 rounded-20 p-1 text-text-icon outline-none hover:text-text focus-visible:shadow-focus" aria-label="Dismiss">
          <X className="size-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function AlertTitle({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("font-semibold", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("[&_a]:underline", className)} {...props} />;
}
