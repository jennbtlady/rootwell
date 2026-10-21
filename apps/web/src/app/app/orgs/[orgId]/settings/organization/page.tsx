import type { Metadata } from "next";
import { getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Card, Heading } from "@/components/ui";
import { OrgDetails } from "@/components/settings/org-details";

export const metadata: Metadata = { title: "Organization details" };

export default async function OrganizationDetailsPage({ params }: PageProps<"/app/orgs/[orgId]/settings/organization">) {
  const { orgId } = await params;
  const session = await requireSession();
  const org = await withSession(session, (tx) => getOrg(tx, orgId));
  if (!org) return null;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          Organization details
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">Your EIN and mailing address appear on every thank-you letter and year-end statement.</p>
      </div>
      <Card className="p-4 sm:p-6">
        <OrgDetails org={org} />
      </Card>
    </div>
  );
}
