import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrg, listImportJobs } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { Badge, buttonVariants, EmptyState, Heading, Paragraph, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";

export const metadata: Metadata = { title: "Imports" };

const STATUS: Record<string, { label: string; variant: "neutral" | "warning" | "success" | "default" }> = {
  uploading: { label: "Uploading", variant: "neutral" },
  ready: { label: "Waiting for review", variant: "warning" },
  committed: { label: "Imported", variant: "success" },
  rolled_back: { label: "Rolled back", variant: "default" },
};

export default async function ImportsPage({ params }: PageProps<"/app/orgs/[orgId]/imports">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [org, jobs] = await withSession(session, (tx) => Promise.all([getOrg(tx, orgId), listImportJobs(tx, orgId)]));
  if (!org || (org.role !== "owner" && org.role !== "admin")) notFound();
  const base = `/app/orgs/${orgId}/imports`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading variant="heading30" as="h1" noMargin>
            Imports
          </Heading>
          <Paragraph noMargin className="mt-1 max-w-2xl text-text-weak">
            Bring in a spreadsheet of people, or people with their gift history. Nothing is saved until you review it, and every import can be rolled back.
          </Paragraph>
        </div>
        <Link href={`${base}/new`} className={buttonVariants()}>
          Import a spreadsheet
        </Link>
      </div>
      {jobs.length === 0 ? (
        <EmptyState title="No imports yet" action={<Link href={`${base}/new`} className={buttonVariants()}>Import a spreadsheet</Link>}>
          CSV and Excel files from Little Green Light, Bloomerang, Zeffy, Givebutter, Stripe or your own spreadsheet all work.
        </EmptyState>
      ) : (
        <Table label="Imports">
          <THead>
            <TR>
              <TH>File</TH>
              <TH>Started</TH>
              <TH>By</TH>
              <TH align="right">Rows</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {jobs.map((j) => (
              <TR key={j.id}>
                <TD>
                  <Link href={`${base}/${j.id}`} className={anchorClass + " font-medium"}>
                    {j.fileName}
                  </Link>
                </TD>
                <TD className="text-text-weak">{formatDateTime(j.createdAt)}</TD>
                <TD className="text-text-weak">{j.createdByName ?? ""}</TD>
                <TD align="right">{j.expectedRows.toLocaleString()}</TD>
                <TD>
                  <Badge variant={STATUS[j.status]!.variant}>{STATUS[j.status]!.label}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
