import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { REPORTS } from "@maple/core";
import { getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading, Paragraph } from "@/components/ui";

export const metadata: Metadata = { title: "Lists and downloads" };

export default async function ReportsPage({ params }: PageProps<"/app/orgs/[orgId]/reports">) {
  const { orgId } = await params;
  const session = await requireSession();
  const org = await withSession(session, (tx) => getOrg(tx, orgId));
  if (!org || org.role === "board_viewer") notFound();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          Lists and downloads
        </Heading>
        <Paragraph noMargin className="mt-1 text-text-weak">
          The lists small development offices use most. Each one opens with filters and downloads as a spreadsheet.
        </Paragraph>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <li key={r.id}>
            <Link href={`/app/orgs/${orgId}/reports/${r.id}`} className="block h-full rounded-30 border border-border-weaker bg-background-weakest p-4 outline-none transition-[box-shadow] hover:shadow-border-primary focus-visible:shadow-focus">
              <div className="text-30 font-semibold leading-5">{r.title}</div>
              <div className="mt-1 text-30 leading-5 text-text-weak">{r.description}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
