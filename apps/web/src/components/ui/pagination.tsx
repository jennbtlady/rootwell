"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** Pagination after Paste's Pagination. Page numbers are links styled like text; the current page is highlighted. */
export function Pagination({ page, pageCount, onPage, label = "Pagination" }: { page: number; pageCount: number; onPage: (p: number) => void; label?: string }) {
  if (pageCount <= 1) return null;
  const pages = visiblePages(page, pageCount);
  const btn = "rounded-20 px-2 py-1 text-30 leading-5 outline-none transition-colors focus-visible:shadow-focus disabled:text-text-weaker";
  return (
    <nav aria-label={label} className="flex items-center gap-1">
      <button type="button" className={cn(btn, "flex items-center gap-1 text-text-weak hover:text-text-link")} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="size-4" aria-hidden="true" /> Previous
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`gap-${i}`} className="px-1 text-text-weak" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === page ? "page" : undefined}
            className={cn(btn, "min-w-8 border", p === page ? "border-border-primary bg-background-primary-weakest font-medium text-text-link" : "border-transparent text-text-weak hover:text-text-link")}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" className={cn(btn, "flex items-center gap-1 text-text-weak hover:text-text-link")} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        Next <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

function visiblePages(page: number, count: number): (number | "...")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const set = new Set<number>([1, count, page - 1, page, page + 1]);
  const out: (number | "...")[] = [];
  for (let p = 1; p <= count; p++) {
    if (set.has(p)) out.push(p);
    else if (out[out.length - 1] !== "...") out.push("...");
  }
  return out;
}
