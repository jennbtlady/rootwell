"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function SettingsNav({ orgId }: { orgId: string }) {
  const path = usePathname();
  const base = `/app/orgs/${orgId}/settings`;
  const items = [
    { href: `${base}/coding`, label: "Funds, campaigns, appeals" },
    { href: `${base}/gift-standards`, label: "Gift entry standards" },
    { href: `${base}/board`, label: "Board sharing" },
    { href: `${base}/giving`, label: "Giving pages" },
    { href: `${base}/integrations`, label: "Integrations" },
    { href: `${base}/billing`, label: "Billing" },
    { href: `/app/orgs/${orgId}/imports`, label: "Imports" },
  ];
  return (
    <nav aria-label="Settings">
      <ul className="flex gap-1 overflow-x-auto sm:flex-col">
        {items.map((it) => {
          const active = path.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link href={it.href} aria-current={active ? "page" : undefined} className={cn("block rounded-20 px-3 py-2 text-30 leading-5 outline-none focus-visible:shadow-focus", active ? "bg-background-primary-weakest font-medium text-text-primary" : "text-text-weak hover:bg-background hover:text-text")}>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
