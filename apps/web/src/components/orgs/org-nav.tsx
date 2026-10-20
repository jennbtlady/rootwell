"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function OrgNav({ orgId, canManage, boardOnly = false }: { orgId: string; canManage: boolean; boardOnly?: boolean }) {
  const path = usePathname();
  const base = `/app/orgs/${orgId}`;
  const all = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/dashboard`, label: "Dashboard" },
    { href: `${base}/constituents`, label: "Constituents" },
    { href: `${base}/batches`, label: "Gifts", prefix: `${base}/batches` },
    { href: `${base}/acknowledgments`, label: "Thank-yous", prefix: `${base}/acknowledgments` },
    { href: `${base}/reports`, label: "Reports", prefix: `${base}/reports` },
    { href: `${base}/health`, label: "Data health", prefix: `${base}/health` },
    { href: `${base}/members`, label: "Team" },
    ...(canManage ? [{ href: `${base}/settings/coding`, label: "Settings", prefix: `${base}/settings` }] : []),
  ];
  const items = boardOnly ? all.filter((i) => i.label === "Dashboard") : all;
  return (
    <nav aria-label="Organization sections" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b border-border-weak">
        {items.map((it) => {
          const prefixes = "prefix" in it && it.prefix ? [it.prefix] : [it.href];
          if (it.label === "Data health") prefixes.push(`${base}/duplicates`, `${base}/merges`, `${base}/gifts`);
          const active = "exact" in it && it.exact ? path === it.href : prefixes.some((pre) => path.startsWith(pre));
          return (
            <li key={it.href} className="shrink-0">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px block border-b-2 px-4 pb-2 pt-1 text-30 font-medium leading-5 outline-none transition-colors focus-visible:rounded-20 focus-visible:shadow-focus-inset",
                  active ? "border-border-primary text-text-primary" : "border-transparent text-text-weak hover:border-border-primary hover:text-text-link",
                )}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
