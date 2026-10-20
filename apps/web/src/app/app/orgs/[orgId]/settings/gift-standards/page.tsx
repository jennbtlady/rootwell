import type { Metadata } from "next";
import Link from "next/link";
import { getStandards, listCoding } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { StandardsForm } from "@/components/settings/standards-form";

export const metadata: Metadata = { title: "Gift entry standards" };

export default async function StandardsPage({ params }: PageProps<"/app/orgs/[orgId]/settings/gift-standards">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [standards, funds] = await withSession(session, (tx) => Promise.all([getStandards(tx, orgId), listCoding(tx, "funds", orgId)]));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          Gift entry standards
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">
          This is your gift entry procedure, kept where everyone uses it. The gift form enforces it and shows your instructions under each field.{" "}
          <Link href={`/app/orgs/${orgId}/settings/gift-standards/print`} className={anchorClass} target="_blank">
            Printable version
          </Link>
          .
        </p>
      </div>
      <StandardsForm orgId={orgId} standards={standards ?? undefined} funds={funds} />
    </div>
  );
}
