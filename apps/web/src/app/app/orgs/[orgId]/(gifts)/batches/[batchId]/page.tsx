import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getBatch, getConstituent, getOrg, getStandards, listCoding } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, Card, Heading } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { BatchWorkspace } from "@/components/gifts/batch-workspace";
import { depositCheck } from "@/lib/deposit-check";
import { BatchExport } from "@/components/gifts/batch-export";

export default async function BatchPage({ params, searchParams }: PageProps<"/app/orgs/[orgId]/batches/[batchId]">) {
  const { orgId, batchId } = await params;
  const sp = await searchParams;
  if (!z.string().uuid().safeParse(batchId).success) notFound();
  const preselect = typeof sp.constituent === "string" && z.string().uuid().safeParse(sp.constituent).success ? sp.constituent : null;
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const batch = await getBatch(tx, orgId, batchId);
    if (!batch) return null;
    const [org, standards, funds, campaigns, appeals, pre] = await Promise.all([
      getOrg(tx, orgId),
      getStandards(tx, orgId),
      listCoding(tx, "funds", orgId),
      listCoding(tx, "campaigns", orgId),
      listCoding(tx, "appeals", orgId),
      preselect ? getConstituent(tx, orgId, preselect) : Promise.resolve(null),
    ]);
    return { batch, org, standards, funds, campaigns, appeals, pre };
  });
  if (!data || !data.org || !data.standards) notFound();
  const { batch, org } = data;
  const canPost = org.role === "owner" || org.role === "admin";
  const check = depositCheck(batch);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={`/app/orgs/${orgId}/batches`} className={`${anchorClass} text-30`}>
          Gift batches
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Heading variant="heading30" as="h1" noMargin>
            Batch of {formatDate(batch.batchDate)}
          </Heading>
          {batch.status === "posted" ? <Badge variant="success">Posted</Badge> : <Badge variant="warning">Open</Badge>}
        </div>
        {batch.description && <p className="text-30 leading-5 text-text-weak">{batch.description}</p>}
        {batch.notes && <p className="text-30 leading-5 text-text-weak">{batch.notes}</p>}
        {batch.status === "posted" && canPost && (
          <div className="mt-2">
            <BatchExport orgId={orgId} batchId={batch.id} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4 sm:p-4">
          <div className="text-20 font-semibold uppercase tracking-wide text-text-weak">Gifts</div>
          <div className="mt-1 text-50 font-semibold tabular-nums">{batch.giftCount}</div>
          {check.countText && <div className={`text-20 ${check.countDiff === 0 ? "text-text-success" : "text-text-warning"}`}>{check.countText}</div>}
        </Card>
        <Card className="p-4 sm:p-4">
          <div className="text-20 font-semibold uppercase tracking-wide text-text-weak">Total</div>
          <div className="mt-1 text-50 font-semibold tabular-nums">{formatMoney(batch.giftTotal)}</div>
          {check.totalText && <div className={`text-20 ${check.diff === 0 ? "text-text-success" : "text-text-warning"}`}>{check.totalText}</div>}
        </Card>
      </div>

      <BatchWorkspace
        orgId={orgId}
        batch={batch}
        standards={data.standards}
        funds={data.funds}
        campaigns={data.campaigns}
        appeals={data.appeals}
        canPost={canPost}
        preselected={data.pre ? { id: data.pre.id, label: data.pre.displayName, detail: data.pre.primaryEmail } : null}
      />
    </div>
  );
}
