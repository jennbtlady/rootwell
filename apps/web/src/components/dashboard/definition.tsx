"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/cn";

// Opening one definition closes any other, so two boxes never overlap.
const OPENED = "maple:definition-opened";

/**
 * A small "what does this mean" button. Tap, click or focus shows the definition; screen readers
 * get it either way. A tap anywhere else or Escape closes it. On paper the text prints in full.
 */
export function Definition({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const wrap = useRef<HTMLSpanElement>(null);
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

  useEffect(() => {
    const other = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) setOpen(false);
    };
    window.addEventListener(OPENED, other);
    return () => window.removeEventListener(OPENED, other);
  }, [id]);

  // Blur alone misses taps on a phone, where tapping plain text does not move focus.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function toggle() {
    setOpen((o) => {
      if (!o) window.dispatchEvent(new CustomEvent(OPENED, { detail: id }));
      return !o;
    });
  }

  return (
    <span ref={wrap} className="relative inline-flex normal-case tracking-normal print:hidden">
      {/* The icon is small, but the button around it is 44px so it is easy to tap. The negative
          margin keeps the label from moving. */}
      <button
        type="button"
        aria-label={`How ${label.toLowerCase()} is counted`}
        aria-describedby={id}
        aria-expanded={open}
        onClick={toggle}
        onBlur={(e) => {
          if (!wrap.current?.contains(e.relatedTarget as Node)) setOpen(false);
        }}
        className="-m-3.5 flex size-11 items-center justify-center rounded-circle text-text-icon outline-none hover:text-text-link focus-visible:shadow-focus"
      >
        <Info className="size-4" aria-hidden="true" />
      </button>
      <span
        ref={box}
        id={id}
        role="tooltip"
        data-state={open ? "open" : "closed"}
        style={open && shift ? { transform: `translateX(${shift}px)` } : undefined}
        className={cn(
          open
            ? "absolute left-0 top-7 z-20 block w-72 max-w-[calc(100vw-2rem)] rounded-30 border border-border-weaker bg-background-weakest p-3 text-30 font-normal leading-5 text-text shadow-elevation-10"
            : "sr-only",
        )}
      >
        {text}
      </span>
    </span>
  );
}

/** The same definitions as numbered notes, shown only when the page is printed. */
export function PrintedDefinitions({ items }: { items: { label: string; text: string }[] }) {
  return (
    <section className="hidden print:block print:break-inside-avoid" aria-hidden="true">
      <h2 className="text-30 font-semibold">How these numbers are counted</h2>
      <dl className="mt-1 flex flex-col gap-1 text-20 leading-4">
        {items.map((d) => (
          <div key={d.label}>
            <dt className="inline font-semibold">{d.label}: </dt>
            <dd className="inline">{d.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
