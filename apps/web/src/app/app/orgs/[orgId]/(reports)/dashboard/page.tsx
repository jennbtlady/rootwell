import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDashboard, getOrg, redactForBoard } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { Heading } from "@/components/ui";
import { BoardDashboard } from "@/components/dashboard/board-dashboard";
import { DashboardActions } from "@/components/dashboard/dashboard-actions";
import { DashboardCustomizer } from "@/components/dashboard/dashboard-customizer";

export const metadata: Metadata = { title: "Board dashboard" };

export default async function DashboardPage({ params }: PageProps<"/app/orgs/[orgId]/dashboard">) {
  const { orgId } = await params;
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const org = await getOrg(tx, orgId);
    if (!org) return null;
    const snap = await getDashboard(tx, orgId);
    if (!snap) return null;
    const board = org.role === "board_viewer";
    return { org, snap: board ? { ...snap, data: redactForBoard(snap.data, org.hideBoardNames) } : snap, board };
  });
  if (!data) notFound();
  const { org, snap, board } = data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading variant="heading30" as="h1" noMargin>
            Board dashboard
          </Heading>
          <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">
            {board
              ? `How fundraising is going this fiscal year. Updated ${formatDateTime(snap.computedAt)}; it refreshes when gifts are posted and every night.`
              : `What your board sees, on board links and when they sign in. Updated ${formatDateTime(snap.computedAt)}; it refreshes when gifts are posted and every night.${org.hideBoardNames ? " Donor names are hidden from the board." : ""}`}
          </p>
        </div>
        <DashboardActions orgId={orgId} canShare={org.role === "owner" || org.role === "admin"} />
      </div>
      <DashboardCustomizer orgId={orgId} view="board" layout={org.dashboardLayouts.board} canCustomize={org.role === "owner" || org.role === "admin"}>
        <BoardDashboard data={snap.data} showNames={!org.hideBoardNames} layout={org.dashboardLayouts.board} />
      </DashboardCustomizer>
    </div>
  );
}
