import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrg, statementDonors } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { StatementsPanel } from "@/components/acks/statements-panel";

export const metadata: Metadata = { title: "Year-end statements" };

export default async function StatementsPage({ params, searchParams }: PageProps<"/app/orgs/[orgId]/acknowledgments/statements">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const lastYear = new Date().getFullYear() - 1;
  const year = Number(typeof sp.year === "string" ? sp.year : lastYear) || lastYear;
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const org = await getOrg(tx, orgId);
    if (!org || (org.role !== "owner" && org.role !== "admin")) return null;
    return { donors: await statementDonors(tx, orgId, year), ein: org.ein };
  });
  if (!data) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/app/orgs/${orgId}/acknowledgments`} className={`${anchorClass} text-30`}>
          Thank-yous
        </Link>
        <Heading variant="heading30" as="h1" noMargin className="mt-1">
          Year-end giving statements
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">
          One statement per donor for a calendar year, with the deductible amount of each gift. Send them in January. From tax year 2026, donors who do not itemize can deduct some gifts, so more of them will ask.
        </p>
      </div>
      <StatementsPanel
        orgId={orgId}
        year={year}
        missingEin={!data.ein}
        donors={data.donors.map((d) => ({ constituentId: d.constituentId, name: d.name, email: d.email, doNotEmail: d.doNotEmail, hasAddress: d.addressLines.length > 0, gifts: d.gifts.length, total: d.total, deductibleTotal: d.deductibleTotal, emailedAt: d.emailedAt, printedAt: d.printedAt }))}
      />
    </div>
  );
}
