import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

const STEPS = ["Upload", "Match columns", "Fix problems", "Review matches", "Import"];

/** The five steps from the brief, as a list a screen reader announces with the current step. */
export function ImportSteps({ current, done = false }: { current: 1 | 2 | 3 | 4 | 5; done?: boolean }) {
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-2 text-30 leading-5" aria-label="Import steps">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = done || n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={label} aria-current={state === "current" ? "step" : undefined} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-circle text-20 font-semibold",
                state === "done" && "bg-background-success-weakest text-text-success",
                state === "current" && "bg-background-primary text-text-inverse",
                state === "todo" && "bg-background text-text-weak",
              )}
            >
              {state === "done" ? <Check className="size-3.5" aria-hidden="true" /> : n}
            </span>
            <span className={cn(state === "current" ? "font-semibold text-text" : "text-text-weak")}>{label}</span>
            {state === "done" && <span className="sr-only">(done)</span>}
          </li>
        );
      })}
    </ol>
  );
}
