import { notFound } from "next/navigation";
import { getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";

/**
 * The Fundraising side of the app (docs/navigation.md): giving pages now, then campaigns,
 * people raising money and events. Only for organizations with the Donations module, and
 * not for board viewers, who see Reports only.
 */
export default async function FundraisingLayout({ params, children }: LayoutProps<"/app/orgs/[orgId]/fundraising">) {
  const { orgId } = await params;
  const session = await requireSession();
  const org = await withSession(session, (tx) => getOrg(tx, orgId));
  if (!org?.modules.includes("donations") || org.role === "board_viewer") notFound();
  return children;
}
