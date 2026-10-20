import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MERGE_FIELDS } from "@maple/core";
import { getOrg, listTemplates } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { TemplateEditor } from "@/components/acks/template-editor";

export const metadata: Metadata = { title: "Thank-you templates" };

export default async function TemplatesPage({ params }: PageProps<"/app/orgs/[orgId]/acknowledgments/templates">) {
  const { orgId } = await params;
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const org = await getOrg(tx, orgId);
    if (!org || (org.role !== "owner" && org.role !== "admin")) return null;
    return listTemplates(tx, orgId);
  });
  if (!data) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/app/orgs/${orgId}/acknowledgments`} className={`${anchorClass} text-30`}>
          Thank-yous
        </Link>
        <Heading variant="heading30" as="h1" noMargin className="mt-1">
          Thank-you templates
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">
          Write it the way you would say it. Keep {"{{substantiation}}"} in every template: it adds the wording the IRS requires and changes with the gift. Have your accountant read your templates once before tax season.
        </p>
      </div>
      <details className="rounded-30 border border-border-weaker bg-background-weakest p-4 text-30">
        <summary className="cursor-pointer font-semibold">Merge fields you can use</summary>
        <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
          {MERGE_FIELDS.map((f) => (
            <div key={f.key} className="contents">
              <dt className="font-mono text-20">{`{{${f.key}}}`}</dt>
              <dd className="text-text-weak">{f.label}</dd>
            </div>
          ))}
        </dl>
      </details>
      {data.map((t) => (
        <TemplateEditor key={t.id} orgId={orgId} template={t} />
      ))}
    </div>
  );
}
