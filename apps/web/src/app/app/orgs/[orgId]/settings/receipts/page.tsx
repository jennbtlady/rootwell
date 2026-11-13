import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolvedReceipts } from "@maple/core";
import { getOrg, getReceiptSettings } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { ReceiptsForm } from "@/components/settings/receipts-form";

export const metadata: Metadata = { title: "Online receipts" };

/** The automatic email receipt for online gifts (fundraising Phase 2). Donations module only. */
export default async function ReceiptsPage({ params }: PageProps<"/app/orgs/[orgId]/settings/receipts">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [org, r] = await withSession(session, (tx) => Promise.all([getOrg(tx, orgId), getReceiptSettings(tx, orgId)]));
  if (!org?.modules.includes("donations") || !r) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          Online receipts
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">
          Every online gift gets a receipt by email right away, with what the IRS asks for. The receipt counts as your thank-you, so these gifts do not wait on your thank-you list. You can still send a personal note from the donor&rsquo;s page.
        </p>
      </div>
      <ReceiptsForm orgId={orgId} orgName={r.org.name} hasEin={!!r.org.ein} settings={r.settings} defaults={resolvedReceipts({}, r.org)} canEdit={org.role === "owner" || org.role === "admin"} />
    </div>
  );
}
