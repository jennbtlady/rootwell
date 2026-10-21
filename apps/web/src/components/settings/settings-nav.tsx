"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Settings, grouped so the list reads as three short lists, not one long one. */
export function SettingsNav({ orgId }: { orgId: string }) {
  const path = usePathname();
  const base = `/app/orgs/${orgId}/settings`;
  const groups = [
    {
      title: "Your organization",
      items: [
        { href: `${base}/organization`, label: "Organization details" },
        { href: `${base}/team`, label: "Team" },
        { href: `${base}/account`, label: "Account and export" },
        { href: `${base}/billing`, label: "Billing" },
      ],
    },
    {
      title: "Gifts",
      items: [
        { href: `${base}/coding`, label: "Funds, campaigns, appeals" },
        { href: `${base}/gift-standards`, label: "Gift entry rules" },
        { href: `${base}/giving`, label: "Giving pages" },
      ],
    },
    {
      title: "Connections",
      items: [
        { href: `${base}/integrations`, label: "Stripe, Mailchimp, QuickBooks" },
        { href: `${base}/board`, label: "Board sharing" },
        { href: `/app/orgs/${orgId}/imports`, label: "Imports" },
      ],
    },
  ];
  // On a phone, the list is its own page (Settings) and each settings page links back to
  // it. On a computer the list stays beside every settings page.
  const onIndex = path === base;
  return (
    <>
    {!onIndex && (
      <Link href={base} className="rounded-20 text-30 font-medium text-text-link outline-none hover:underline focus-visible:shadow-focus sm:hidden">
        <span aria-hidden="true">‹ </span>All settings
      </Link>
    )}
    <nav aria-label="Settings" className={cn("flex-col gap-4", onIndex ? "flex" : "hidden sm:flex")}>
      {groups.map((g, gi) => (
        <div key={g.title}>
          <p id={`settings-group-${gi}`} className="mb-1 px-3 text-20 font-semibold uppercase tracking-wide text-text-weak">
            {g.title}
          </p>
          <ul aria-labelledby={`settings-group-${gi}`} className="flex flex-col">
            {g.items.map((it) => {
              const active = path === it.href || path.startsWith(`${it.href}/`);
              return (
                <li key={it.href}>
                  <Link href={it.href} aria-current={active ? "page" : undefined} className={cn("block rounded-20 px-3 py-2 text-30 leading-5 outline-none focus-visible:shadow-focus", active ? "bg-background-primary-weakest font-medium text-text-primary" : "text-text-weak hover:bg-background hover:text-text")}>
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
    </>
  );
}
