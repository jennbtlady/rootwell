"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";

/** A small "what does this mean" button. Click or focus shows the definition; screen readers get it either way. */
export function Definition({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
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
        id={id}
        role="tooltip"
        className={`${open ? "block" : "sr-only"} absolute left-0 top-6 z-20 w-72 rounded-30 border border-border-weaker bg-background-weakest p-3 text-30 font-normal leading-5 text-text shadow-elevation-10`}
      >
        {text}
      </span>
    </span>
  );
}
