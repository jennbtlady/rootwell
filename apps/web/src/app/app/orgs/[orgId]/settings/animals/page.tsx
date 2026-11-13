import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrg, listAnimals, listCoding } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { AnimalsManager } from "@/components/settings/animals-manager";

export const metadata: Metadata = { title: "Animals to sponsor" };

/** The animals donors can sponsor on giving pages (fundraising Phase 2). Donations module only. */
export default async function AnimalsPage({ params }: PageProps<"/app/orgs/[orgId]/settings/animals">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [org, animals, funds] = await withSession(session, (tx) => Promise.all([getOrg(tx, orgId), listAnimals(tx, orgId), listCoding(tx, "funds", orgId)]));
  if (!org?.modules.includes("donations")) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          Animals to sponsor
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">
          Donors can choose an animal to sponsor on your giving pages. Add each animal once, then pick which ones each giving page shows.
        </p>
      </div>
      <AnimalsManager orgId={orgId} animals={animals} funds={funds} canEdit={org.role === "owner" || org.role === "admin"} />
    </div>
  );
}
