import { notFound } from "next/navigation";
import { getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";

/** Giving pages belong to the Donations module (fundraising Phase 1). Without it, they do not exist. */
export default async function GivingLayout({ params, children }: LayoutProps<"/app/orgs/[orgId]/settings/giving">) {
  const { orgId } = await params;
  const session = await requireSession();
  const org = await withSession(session, (tx) => getOrg(tx, orgId));
  if (!org?.modules.includes("donations")) notFound();
  return children;
}
