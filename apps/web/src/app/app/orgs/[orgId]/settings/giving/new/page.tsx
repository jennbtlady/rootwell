import type { Metadata } from "next";
import { listAnimals, listCoding } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { DonationPageForm } from "@/components/settings/donation-page-form";

export const metadata: Metadata = { title: "New giving page" };

export default async function NewGivingPage({ params }: PageProps<"/app/orgs/[orgId]/settings/giving/new">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [funds, campaigns, animals] = await withSession(session, (tx) => Promise.all([listCoding(tx, "funds", orgId), listCoding(tx, "campaigns", orgId), listAnimals(tx, orgId)]));
  return (
    <div className="flex flex-col gap-4">
      <Heading variant="heading30" as="h1" noMargin>
        New giving page
      </Heading>
      <DonationPageForm orgId={orgId} funds={funds} campaigns={campaigns} animals={animals} page={null} />
    </div>
  );
}
