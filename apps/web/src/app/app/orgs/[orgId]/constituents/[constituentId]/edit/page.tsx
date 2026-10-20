import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getConstituent } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { ConstituentForm } from "@/components/constituents/constituent-form";

export const metadata: Metadata = { title: "Edit constituent" };

export default async function EditConstituentPage({ params }: PageProps<"/app/orgs/[orgId]/constituents/[constituentId]/edit">) {
  const { orgId, constituentId } = await params;
  if (!z.string().uuid().safeParse(constituentId).success) notFound();
  const session = await requireSession();
  const c = await withSession(session, (tx) => getConstituent(tx, orgId, constituentId));
  if (!c) notFound();
  return (
    <div className="flex flex-col gap-4">
      <Heading variant="heading30" as="h1" noMargin>
        Edit {c.displayName}
      </Heading>
      <ConstituentForm orgId={orgId} existing={c} />
    </div>
  );
}
