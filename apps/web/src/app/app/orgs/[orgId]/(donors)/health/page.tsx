import type { Metadata } from "next";
import Link from "next/link";
import { dataHealth, getOrg, integrationHealth, listImportJobs } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { Card, Heading, Paragraph } from "@/components/ui";
import { ScanButton } from "@/components/dedupe/scan-button";
import { IntegrationHealthPanel } from "@/components/settings/integration-health";

export const metadata: Metadata = { title: "Data health" };

/** The counts the brief lists, each linking to the list that fixes it. */
export default async function HealthPage({ params }: PageProps<"/app/orgs/[orgId]/health">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [h, org, ih, imports] = await withSession(session, (tx) => Promise.all([dataHealth(tx, orgId), getOrg(tx, orgId), integrationHealth(tx, orgId), listImportJobs(tx, orgId)]));
  const canImport = org?.role === "owner" || org?.role === "admin";
  const lastImport = imports.find((j) => j.status === "committed");
  const base = `/app/orgs/${orgId}`;
  const pct = (n: number) => (h.constituents ? Math.round((n / h.constituents) * 100) : 0);

  const items: { label: string; count: number; detail: string; href: string; tone: "good" | "warn" | "neutral" }[] = [
    { label: "Possible duplicates", count: h.openDuplicates, detail: "Pairs that look like the same person. Compare and merge, or mark them as different.", href: `${base}/duplicates`, tone: h.openDuplicates ? "warn" : "good" },
    { label: "No email", count: h.missingEmail, detail: `${pct(h.missingEmail)}% of donors. Emails make thank-yous and Mailchimp possible.`, href: `${base}/constituents?filter=missing_email`, tone: "neutral" },
    { label: "No mailing address", count: h.missingAddress, detail: `${pct(h.missingAddress)}% of donors. Needed for letters and year-end statements.`, href: `${base}/constituents?filter=missing_address`, tone: "neutral" },
    { label: "Gifts with no fund", count: h.giftsMissingFund, detail: "Every gift needs a fund for the dashboard and the bookkeeping export.", href: `${base}/gifts?filter=missing_fund`, tone: h.giftsMissingFund ? "warn" : "good" },
    { label: "Unthanked gifts older than 14 days", count: h.unacknowledged14d, detail: "Posted gifts with no acknowledgment yet. Donors who are thanked quickly give again.", href: `${base}/gifts?filter=unacknowledged`, tone: h.unacknowledged14d ? "warn" : "good" },
    { label: "Stale records", count: h.stale36m, detail: "No gift or note in 36 months. Worth a call, a last appeal, or a note before they fall off the list.", href: `${base}/constituents?filter=stale`, tone: "neutral" },
  ];
  const TONE = { good: "text-text-success", warn: "text-text-warning", neutral: "text-text" };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading variant="heading30" as="h1" noMargin>
            Data health
          </Heading>
          <Paragraph noMargin className="mt-1 text-text-weak">
            {h.constituents} donors. Each number links to the list that fixes it.
          </Paragraph>
        </div>
        <ScanButton orgId={orgId} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Link key={it.label} href={it.href} className="block rounded-30 border border-border-weaker bg-background-weakest p-4 outline-none transition-[box-shadow] hover:shadow-border-primary focus-visible:shadow-focus">
            <div className={`text-70 font-semibold tabular-nums leading-8 ${TONE[it.tone]}`}>{it.count}</div>
            <div className="mt-1 text-30 font-semibold leading-5">{it.label}</div>
            <div className="mt-1 text-30 leading-5 text-text-weak">{it.detail}</div>
          </Link>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-30 font-semibold leading-5">Merge history</div>
            <div className="text-30 leading-5 text-text-weak">
              {h.recentMerges === 0 ? "No merges in the last 30 days." : `${h.recentMerges} merge${h.recentMerges === 1 ? "" : "s"} can still be undone.`}
              {org?.role === "staff" ? " Owners and admins merge; you can mark pairs as different." : ""}
            </div>
          </div>
          <Link href={`${base}/merges`} className="text-30 text-text-link underline-offset-2 hover:underline">
            See all merges
          </Link>
        </div>
      </Card>
      {canImport && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-30 font-semibold leading-5">Imports</div>
              <div className="text-30 leading-5 text-text-weak">
                {lastImport ? `Last import: ${lastImport.fileName}, ${formatDateTime(lastImport.committedAt)}. An import that went wrong can be undone.` : "No imports yet."}
              </div>
            </div>
            <Link href={`${base}/imports`} className="text-30 text-text-link underline-offset-2 hover:underline">
              Past imports
            </Link>
          </div>
        </Card>
      )}
      <IntegrationHealthPanel orgId={orgId} health={ih} canResolve={org?.role === "owner" || org?.role === "admin"} />
    </div>
  );
}
