"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export function OrgNav({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const path = usePathname();
  const base = `/app/orgs/${orgId}`;
  const items = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/constituents`, label: "Constituents" },
    { href: `${base}/batches`, label: "Gifts" },
    { href: `${base}/members`, label: "Team" },
    ...(canManage ? [{ href: `${base}/settings/coding`, label: "Settings", prefix: `${base}/settings` }] : []),
  ];
  return (
    <nav aria-label="Organization sections" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b border-border-weak">
        {items.map((it) => {
          const active = "exact" in it && it.exact ? path === it.href : path.startsWith(("prefix" in it && it.prefix) || it.href);
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
