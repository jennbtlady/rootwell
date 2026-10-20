import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrg, listAckQueue, listTemplates } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading, Paragraph } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { AckQueue } from "@/components/acks/ack-queue";

export const metadata: Metadata = { title: "Thank-yous" };

export default async function AcknowledgmentsPage({ params }: PageProps<"/app/orgs/[orgId]/acknowledgments">) {
  const { orgId } = await params;
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const org = await getOrg(tx, orgId);
    if (!org || org.role === "board_viewer") return null;
    return { org, queue: await listAckQueue(tx, orgId, { limit: 500 }), templates: await listTemplates(tx, orgId) };
  });
  if (!data) notFound();
  const canManage = data.org.role === "owner" || data.org.role === "admin";
  const base = `/app/orgs/${orgId}/acknowledgments`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading variant="heading30" as="h1" noMargin>
            Thank-yous
          </Heading>
          <Paragraph noMargin className="mt-1 max-w-2xl text-text-weak">
            Every posted gift waits here until it is thanked. Thank donors within two days if you can; it is the single best predictor of a second gift.
          </Paragraph>
        </div>
        <div className="flex flex-wrap gap-3 text-30">
          {canManage && (
            <Link href={`${base}/templates`} className={anchorClass}>
              Edit templates
            </Link>
          )}
          {canManage && (
            <Link href={`${base}/statements`} className={anchorClass}>
              Year-end statements
            </Link>
          )}
        </div>
      </div>
      <AckQueue orgId={orgId} items={data.queue.items} total={data.queue.total} templates={data.templates} />
    </div>
  );
}
