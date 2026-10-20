import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { UploadStep } from "@/components/imports/upload-step";
import { ImportSteps } from "@/components/imports/import-steps";

export const metadata: Metadata = { title: "Import a spreadsheet" };

export default async function NewImportPage({ params }: PageProps<"/app/orgs/[orgId]/imports/new">) {
  const { orgId } = await params;
  const session = await requireSession();
  const org = await withSession(session, (tx) => getOrg(tx, orgId));
  if (!org || (org.role !== "owner" && org.role !== "admin")) notFound();
  return (
    <div className="flex flex-col gap-4">
      <Heading variant="heading30" as="h1" noMargin>
        Import a spreadsheet
      </Heading>
      <ImportSteps current={1} />
      <UploadStep orgId={orgId} />
    </div>
  );
}
