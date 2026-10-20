import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { REPORTS, reportParams, type ReportId } from "@maple/core";
import { getOrg, listCoding, runReport } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";

export const metadata: Metadata = { title: "Report" };

export default async function ReportPage({ params, searchParams }: PageProps<"/app/orgs/[orgId]/reports/[reportId]">) {
  const { orgId, reportId } = await params;
  const report = REPORTS.find((r) => r.id === reportId);
  if (!report) notFound();
  const sp = await searchParams;
  const parsed = reportParams.safeParse({ from: sp.from, to: sp.to, campaignId: sp.campaignId });
  const p = parsed.success ? parsed.data : {};
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const org = await getOrg(tx, orgId);
    if (!org || org.role === "board_viewer") return null;
    const campaigns = (report.params as readonly string[]).includes("campaignId") ? await listCoding(tx, "campaigns", orgId, { includeInactive: true }) : [];
    return { result: await runReport(tx, orgId, report.id as ReportId, p), campaigns };
  });
  if (!data) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/app/orgs/${orgId}/reports`} className={`${anchorClass} text-30`}>
          Reports
        </Link>
        <Heading variant="heading30" as="h1" noMargin className="mt-1">
          {report.title}
        </Heading>
        <p className="mt-1 text-30 leading-5 text-text-weak">{report.description}</p>
      </div>
      <ReportFilters orgId={orgId} reportId={report.id} params={report.params as readonly string[]} values={p} campaigns={data.campaigns.map((c) => ({ id: c.id, name: c.name }))} />
      <ReportTable orgId={orgId} title={report.title} result={data.result} />
    </div>
  );
}
