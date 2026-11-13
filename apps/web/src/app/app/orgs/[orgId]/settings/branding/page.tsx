import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { BrandingForm } from "@/components/settings/branding-form";

export const metadata: Metadata = { title: "Public page look" };

/** How giving pages (and later fundraiser and event pages) look. Donations module only. */
export default async function BrandingPage({ params }: PageProps<"/app/orgs/[orgId]/settings/branding">) {
  const { orgId } = await params;
  const session = await requireSession();
  const org = await withSession(session, (tx) => getOrg(tx, orgId));
  if (!org?.modules.includes("donations")) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          Public page look
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">
          Your giving pages carry your colors, logo and a header photo, so donors know they are giving to you. Rootwell appears only as a small &ldquo;Powered by Rootwell&rdquo; at the bottom.
        </p>
      </div>
      <BrandingForm orgId={orgId} orgName={org.name} branding={org.branding} logoPath={org.logoPath} />
    </div>
  );
}
