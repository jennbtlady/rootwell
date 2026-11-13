import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDonationPage, listAnimals, listCoding } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { DonationPageForm } from "@/components/settings/donation-page-form";
import { EmbedCode } from "@/components/settings/embed-code";

export const metadata: Metadata = { title: "Edit giving page" };

export default async function EditGivingPage({ params }: PageProps<"/app/orgs/[orgId]/settings/giving/[pageId]">) {
  const { orgId, pageId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(pageId)) notFound();
  const session = await requireSession();
  const [page, funds, campaigns, animals] = await withSession(session, (tx) => Promise.all([getDonationPage(tx, orgId, pageId), listCoding(tx, "funds", orgId), listCoding(tx, "campaigns", orgId), listAnimals(tx, orgId)]));
  if (!page) notFound();
  return (
    <div className="flex flex-col gap-4">
      <Heading variant="heading30" as="h1" noMargin>
        Edit giving page
      </Heading>
      <EmbedCode origin={(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")} slug={page.slug} active={page.active} />
      <DonationPageForm orgId={orgId} funds={funds} campaigns={campaigns} animals={animals} page={page} />
    </div>
  );
}
