import * as React from "react";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

/** Help text under a field, after Paste's HelpText. Error text names the fix, not just the fault. */
export type HelpTextProps = React.ComponentPropsWithRef<"div"> & {
  variant?: "default" | "error" | "success" | "warning";
};

const VARIANT = {
  default: { color: "text-text-weak", Icon: null },
  error: { color: "text-text-error", Icon: CircleAlert },
  success: { color: "text-text-success", Icon: CircleCheck },
  warning: { color: "text-text-warning", Icon: TriangleAlert },
} as const;

export function HelpText({ className, variant = "default", children, ...props }: HelpTextProps) {
  const { color, Icon } = VARIANT[variant];
  return (
    <div className={cn("mt-2 flex gap-1 text-30 leading-5", color, className)} {...props}>
      {Icon && <Icon aria-hidden="true" className="mt-px size-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}
