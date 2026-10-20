import * as React from "react";
import { cn } from "cn";
import { Heading } from "./heading";

/**
 * Empty state after Paste's pattern: say what belongs here, why it is empty, and the
 * one action that fills it. Keep it to a heading, one sentence, one button.
 */
export function EmptyState({ title, children, action, className }: { title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-30 border border-dashed border-border-weak bg-background-weakest px-6 py-10 text-center", className)}>
      <Heading variant="heading40" as="h2" noMargin>
        {title}
      </Heading>
      {children && <p className="max-w-md text-30 leading-5 text-text-weak">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
