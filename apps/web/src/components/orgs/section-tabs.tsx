"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * The second level inside a main area: a short row of tabs, always visible. Each tab
 * names the pages it covers with `match`, so a detail page keeps its tab lit.
 */
export function SectionTabs({ label, tabs }: { label: string; tabs: { href: string; label: string; match?: string[] }[] }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {tabs.map((t) => {
          const active = [t.href, ...(t.match ?? [])].some((m) => path === m || path.startsWith(`${m}/`));
          return (
            <li key={t.href} className="shrink-0">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-pill px-3 py-1.5 text-30 font-medium leading-5 outline-none focus-visible:shadow-focus",
                  active ? "bg-background-primary-weakest text-text-primary shadow-border-primary-weaker" : "text-text-weak hover:bg-background hover:text-text",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
