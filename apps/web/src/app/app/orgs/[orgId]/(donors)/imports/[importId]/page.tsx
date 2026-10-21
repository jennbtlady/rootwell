import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getImportJob, getOrg, listImportRows, listSavedMappings } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { ImportWorkspace } from "@/components/imports/import-workspace";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage({ params }: PageProps<"/app/orgs/[orgId]/imports/[importId]">) {
  const { orgId, importId } = await params;
  if (!z.string().uuid().safeParse(importId).success) notFound();
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const org = await getOrg(tx, orgId);
    if (!org || (org.role !== "owner" && org.role !== "admin")) return null;
    const job = await getImportJob(tx, orgId, importId);
    if (!job) return null;
    const [samples, saved] = await Promise.all([listImportRows(tx, orgId, importId, { limit: 3 }), listSavedMappings(tx, orgId)]);
    return { job, samples: samples.items.map((r) => r.raw), saved };
  });
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/app/orgs/${orgId}/imports`} className={`${anchorClass} text-30`}>
          Imports
        </Link>
        <Heading variant="heading30" as="h1" noMargin className="mt-1">
          {data.job.fileName}
        </Heading>
      </div>
      <ImportWorkspace orgId={orgId} job={data.job} samples={data.samples} saved={data.saved} />
    </div>
  );
}
