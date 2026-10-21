"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/cn";

/** A small "what does this mean" button. Click or focus shows the definition; screen readers get it either way. */
export function Definition({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const box = useRef<HTMLSpanElement>(null);
  const id = useId();

  // Keep the open box on screen: near the right edge it slides left instead of making
  // the page scroll sideways on a phone.
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const over = r.right + shift - (window.innerWidth - 16);
    setShift(over > 0 ? -Math.ceil(over) : 0);
    // Measure once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <span className="relative inline-flex normal-case tracking-normal print:hidden">
      <button
        type="button"
        aria-label={`How ${label.toLowerCase()} is counted`}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="rounded-circle p-0.5 text-text-icon outline-none hover:text-text-link focus-visible:shadow-focus"
      >
        <Info className="size-4" aria-hidden="true" />
      </button>
      <span
        ref={box}
        id={id}
        role="tooltip"
        style={open && shift ? { transform: `translateX(${shift}px)` } : undefined}
        className={cn(
          open
            ? "absolute left-0 top-6 z-20 block w-72 max-w-[calc(100vw-2rem)] rounded-30 border border-border-weaker bg-background-weakest p-3 text-30 font-normal leading-5 text-text shadow-elevation-10"
            : "sr-only",
        )}
      >
        {text}
      </span>
    </span>
  );
}
