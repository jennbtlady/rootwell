"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * The main areas of the side of the app you are on (docs/navigation.md), named for what people
 * come to do. The CRM has five; Fundraising has its own short list. Always on screen: tabs
 * across the top on a computer, a tab bar along the bottom on a phone.
 */
type Area = { key: string; label: string; href: string; match: string[]; icon: React.ReactNode };

const I = (d: string) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS = {
  home: I("M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-6h4v6"),
  donors: I("M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c1.8.8 3 2.6 3 4.5"),
  gifts: I("M12 3v18M16.5 7.5C16.5 5.6 14.5 5 12 5S7.5 5.8 7.5 7.7c0 4.3 9 2.3 9 6.6 0 2-2 2.7-4.5 2.7s-4.5-.8-4.5-2.5"),
  thanks: I("M3 7l9 6 9-6M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"),
  reports: I("M4 20V10M10 20V4M16 20v-7M22 20H2"),
  overview: I("M4 13h6V4H4v9Zm10 7h6v-9h-6v9ZM4 20h6v-4H4v4Zm10-11h6V4h-6v5Z"),
  pages: I("M7 3h7l5 5v13H7V3Zm7 0v5h5M10 13h6M10 17h6"),
};

/** Which side of the app a path is on. Each side lives under its own address. */
export function sideFor(path: string, orgId: string): "crm" | "fundraising" {
  return path === `/app/orgs/${orgId}/fundraising` || path.startsWith(`/app/orgs/${orgId}/fundraising/`) ? "fundraising" : "crm";
}

export function PrimaryNav({ orgId, boardOnly = false }: { orgId: string; boardOnly?: boolean }) {
  const path = usePathname();
  const base = `/app/orgs/${orgId}`;
  const fundraising: Area[] = [
    { key: "fr-overview", label: "Overview", href: `${base}/fundraising`, match: [], icon: ICONS.overview },
    { key: "fr-pages", label: "Giving pages", href: `${base}/fundraising/pages`, match: [`${base}/fundraising/pages`, `${base}/fundraising/animals`], icon: ICONS.pages },
  ];
  const all: Area[] = [
    { key: "home", label: "Home", href: base, match: [`${base}/setup`], icon: ICONS.home },
    { key: "donors", label: "Donors", href: `${base}/constituents`, match: ["constituents", "duplicates", "merges", "health", "imports"].map((p) => `${base}/${p}`), icon: ICONS.donors },
    { key: "gifts", label: "Gifts", href: `${base}/batches`, match: [`${base}/batches`, `${base}/gifts`], icon: ICONS.gifts },
    { key: "thanks", label: "Thank-yous", href: `${base}/acknowledgments`, match: [`${base}/acknowledgments`], icon: ICONS.thanks },
    { key: "reports", label: "Reports", href: `${base}/dashboard`, match: [`${base}/dashboard`, `${base}/reports`], icon: ICONS.reports },
  ];
  const side = sideFor(path, orgId);
  const areas = boardOnly ? all.filter((a) => a.key === "reports") : side === "fundraising" ? fundraising : all;
  const isActive = (a: Area) =>
    a.key === "home" ? path === base || a.match.some((m) => path.startsWith(m)) : a.key === "fr-overview" ? path === a.href : a.match.some((m) => path === m || path.startsWith(`${m}/`));
  const label = side === "fundraising" ? "Fundraising" : "Main";

  return (
    <>
      <nav aria-label={label} className="hidden sm:block">
        <ul className="flex gap-1 border-b border-border-weak">
          {areas.map((a) => {
            const active = isActive(a);
            return (
              <li key={a.key}>
                <Link
                  href={a.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px block border-b-2 px-4 pb-2 pt-1 text-40 font-semibold leading-6 outline-none transition-colors focus-visible:rounded-20 focus-visible:shadow-focus-inset",
                    active ? "border-border-primary text-text-primary" : "border-transparent text-text-weak hover:border-border-primary hover:text-text-link",
                  )}
                >
                  {a.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <nav aria-label={label} className="fixed inset-x-0 bottom-0 z-20 border-t border-border-weak bg-background-body pb-[env(safe-area-inset-bottom)] sm:hidden">
        <ul className="flex">
          {areas.map((a) => {
            const active = isActive(a);
            return (
              <li key={a.key} className="flex-1">
                <Link
                  href={a.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 whitespace-nowrap px-0.5 py-1.5 text-20 font-semibold leading-4 outline-none focus-visible:shadow-focus-inset",
                    active ? "text-text-primary" : "text-text-weak",
                  )}
                >
                  {a.icon}
                  {a.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
