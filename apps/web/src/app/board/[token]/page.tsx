import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { withPublic } from "@maple/db";
import { clientIp, getDb, TOO_MANY, visitorKey } from "@maple/api";
import { boardView, hitRateLimit } from "@maple/core/services";
import { formatDate, formatDateTime } from "@/lib/format";
import { Heading } from "@/components/ui";
import { BoardDashboard } from "@/components/dashboard/board-dashboard";
import { PrintButton } from "@/components/dashboard/dashboard-actions";

export const metadata: Metadata = { title: "Board dashboard", robots: { index: false, follow: false } };

/**
 * Read-only board link. No sign-in. The database returns only the dashboard snapshot,
 * with donor names removed when the organization hides them. A turned-off link shows
 * not-found.tsx, which explains what happened.
 */
export default async function BoardPage({ params }: PageProps<"/board/[token]">) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  // Limit per visitor, so nobody can try link after link (launch review, must fix 3).
  const h = await headers();
  const visitor = visitorKey(clientIp((n) => h.get(n)));
  const view = await withPublic(getDb(), async (tx) => ((await hitRateLimit(tx, "boardVisitor", visitor)) ? boardView(tx, token) : ("limited" as const)));
  if (view === "limited") {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-8">
        <Heading variant="heading20" as="h1" noMargin>
          Board dashboard
        </Heading>
        <p className="text-40 leading-7">{TOO_MANY}</p>
      </main>
    );
  }
  if (!view) notFound();
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-30 font-semibold text-text-weak">{view.orgName}</p>
          <Heading variant="heading20" as="h1" noMargin>
            Board dashboard
          </Heading>
          <p className="mt-1 text-30 leading-5 text-text-weak">
            Fiscal year to date, {formatDate(view.data.fiscalYearStart)} through {formatDate(view.data.asOf)}. Updated {formatDateTime(view.computedAt)}.
          </p>
          <p className="mt-1 text-30 leading-5">
            {view.hideNames
              ? "Anyone with this link can see this page. Donor names are hidden."
              : "Anyone with this link can see this page, including the names of the largest donors. Please do not forward it."}
          </p>
        </div>
        <PrintButton />
      </div>
      <BoardDashboard data={view.data} showNames={!view.hideNames} layout={view.layout} />
      <p className="text-20 text-text-weak">Shared read-only by {view.orgName}. Ask them for a new link if this one stops working.</p>
    </main>
  );
}
