"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { sideFor } from "./primary-nav";

/**
 * The switch between the sides of the app, in the header beside the organization's name
 * (docs/navigation.md): the CRM, and Fundraising for organizations that have it. Two visible,
 * labeled tabs, never an icon or a menu. Built as a list so another side (a Board side, say)
 * can join later. Hidden when there is only one side.
 */
export function AppSwitch({ orgId, sides }: { orgId: string; sides: ("crm" | "fundraising")[] }) {
  const path = usePathname();
  if (sides.length < 2) return null;
  const current = sideFor(path, orgId);
  const base = `/app/orgs/${orgId}`;
  const all = { crm: { label: "CRM", href: base }, fundraising: { label: "Fundraising", href: `${base}/fundraising` } };
  return (
    <nav aria-label="Switch app">
      <ul className="flex rounded-pill bg-background p-0.5 shadow-border-weaker">
        {sides.map((k) => {
          const active = k === current;
          return (
            <li key={k}>
              <Link
                href={all[k].href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-pill px-3 py-1 text-30 font-semibold leading-5 outline-none focus-visible:shadow-focus",
                  active ? "bg-background-primary text-text-inverse" : "text-text-weak hover:text-text",
                )}
              >
                {all[k].label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
