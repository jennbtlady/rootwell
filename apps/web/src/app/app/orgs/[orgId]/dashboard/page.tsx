import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDashboard, getOrg, redactForBoard } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { Heading } from "@/components/ui";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { DashboardActions } from "@/components/dashboard/dashboard-actions";

export const metadata: Metadata = { title: "Dashboard" };

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
            Dashboard
          </Heading>
          <p className="mt-1 text-30 leading-5 text-text-weak">
            Fiscal year to date through {snap.data.asOf}. Updated {formatDateTime(snap.computedAt)}; it refreshes every night.
          </p>
        </div>
        <DashboardActions orgId={orgId} />
      </div>
      <DashboardView data={snap.data} showNames={!board || !org.hideBoardNames} lapsedHref={board ? undefined : `/app/orgs/${orgId}/reports/lapsed`} />
    </div>
  );
}
