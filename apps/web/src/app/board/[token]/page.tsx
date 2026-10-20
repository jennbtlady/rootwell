import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withPublic } from "@maple/db";
import { getDb } from "@maple/api";
import { boardView } from "@maple/core/services";
import { formatDateTime } from "@/lib/format";
import { Heading } from "@/components/ui";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PrintButton } from "@/components/dashboard/dashboard-actions";

export const metadata: Metadata = { title: "Board dashboard", robots: { index: false, follow: false } };

/**
 * Read-only board link. No sign-in. The database returns only the dashboard snapshot,
 * with donor names removed when the organization hides them. A revoked link is a 404.
 */
export default async function BoardPage({ params }: PageProps<"/board/[token]">) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const view = await withPublic(getDb(), (tx) => boardView(tx, token));
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
            Fiscal year to date through {view.data.asOf}. Updated {formatDateTime(view.computedAt)}.
          </p>
        </div>
        <PrintButton />
      </div>
      <DashboardView data={view.data} showNames={!view.hideNames} />
      <p className="text-20 text-text-weak">Shared read-only by {view.orgName}. Ask them for a new link if this one stops working.</p>
    </main>
  );
}
