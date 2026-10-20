import type { Metadata } from "next";
import { listCoding } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { CodingManager } from "@/components/settings/coding-manager";

export const metadata: Metadata = { title: "Funds, campaigns, appeals" };

export default async function CodingPage({ params }: PageProps<"/app/orgs/[orgId]/settings/coding">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [funds, campaigns, appeals] = await withSession(session, (tx) => Promise.all([listCoding(tx, "funds", orgId, { includeInactive: true }), listCoding(tx, "campaigns", orgId, { includeInactive: true }), listCoding(tx, "appeals", orgId, { includeInactive: true })]));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          Funds, campaigns and appeals
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">
          Every gift is coded three ways. A fund is where the money goes (general operating, building). A campaign is the effort that raised it (spring appeal, gala). An appeal is the specific ask inside a campaign (the March letter). Keep the lists short.
        </p>
      </div>
      <CodingManager orgId={orgId} funds={funds} campaigns={campaigns} appeals={appeals} />
    </div>
  );
}
