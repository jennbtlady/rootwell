import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getBilling, getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Badge } from "@/components/ui";
import { PrimaryNav } from "@/components/orgs/primary-nav";
import { AppSwitch } from "@/components/orgs/app-switch";
import { BillingBanner } from "@/components/billing/billing-banner";

/**
 * Every page inside one organization: its name, the CRM | Fundraising switch when the
 * organization has Fundraising, a Settings link for owners and admins, and the main areas of
 * the side you are on. See docs/navigation.md.
 */
export default async function OrgLayout({ params, children }: LayoutProps<"/app/orgs/[orgId]">) {
  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success) notFound();
  const session = await requireSession();
  const [org, billing] = await withSession(session, (tx) => Promise.all([getOrg(tx, orgId), getBilling(tx, orgId)]));
  if (!org) notFound();
  const canManage = org.role === "owner" || org.role === "admin";
  const boardOnly = org.role === "board_viewer";
  const sides: ("crm" | "fundraising")[] = !boardOnly && org.modules.includes("donations") ? ["crm", "fundraising"] : ["crm"];

  return (
    <div className="flex flex-col gap-4 pb-20 sm:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={boardOnly ? `/app/orgs/${orgId}/dashboard` : `/app/orgs/${orgId}`} className="rounded-20 text-50 font-semibold tracking-[-0.02em] text-text outline-none focus-visible:shadow-focus">
          {org.name}
        </Link>
        {org.isSample && <Badge variant="new">Sample</Badge>}
        <AppSwitch orgId={orgId} sides={sides} />
        <span className="grow" />
        {canManage && (
          <Link href={`/app/orgs/${orgId}/settings`} className="rounded-20 px-1 text-30 font-medium text-text-link outline-none hover:underline focus-visible:shadow-focus">
            Settings
          </Link>
        )}
      </div>
      <PrimaryNav orgId={orgId} boardOnly={boardOnly} />
      {billing && <BillingBanner orgId={orgId} billing={billing} role={org.role} />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
