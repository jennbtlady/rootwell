import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Badge } from "@/components/ui";
import { OrgNav } from "@/components/orgs/org-nav";

/** Every page inside one organization: name, Sample badge, section navigation. */
export default async function OrgLayout({ params, children }: LayoutProps<"/app/orgs/[orgId]">) {
  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success) notFound();
  const session = await requireSession();
  const org = await withSession(session, (tx) => getOrg(tx, orgId));
  if (!org) notFound();
  const canManage = org.role === "owner" || org.role === "admin";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/app/orgs/${orgId}`} className="rounded-20 text-50 font-semibold tracking-[-0.02em] text-text outline-none focus-visible:shadow-focus">
          {org.name}
        </Link>
        {org.isSample && <Badge variant="new">Sample</Badge>}
      </div>
      <OrgNav orgId={orgId} canManage={canManage} boardOnly={org.role === "board_viewer"} />
      <div>{children}</div>
    </div>
  );
}
