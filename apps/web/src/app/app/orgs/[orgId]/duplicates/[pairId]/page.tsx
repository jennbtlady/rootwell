import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getConstituent, getDuplicate, getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Badge, Heading } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { MergeWorkbench } from "@/components/dedupe/merge-workbench";

export const metadata: Metadata = { title: "Compare records" };

export default async function ComparePage({ params }: PageProps<"/app/orgs/[orgId]/duplicates/[pairId]">) {
  const { orgId, pairId } = await params;
  if (!z.string().uuid().safeParse(pairId).success) notFound();
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const pair = await getDuplicate(tx, orgId, pairId);
    if (!pair) return null;
    const [a, b, org] = await Promise.all([getConstituent(tx, orgId, pair.a.id), getConstituent(tx, orgId, pair.b.id), getOrg(tx, orgId)]);
    if (!a || !b || !org) return null;
    return { pair, a, b, org };
  });
  if (!data) notFound();
  const base = `/app/orgs/${orgId}`;
  const canMerge = data.org.role === "owner" || data.org.role === "admin";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`${base}/duplicates`} className={`${anchorClass} text-30`}>
          Possible duplicates
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Heading variant="heading30" as="h1" noMargin>
            Compare records
          </Heading>
          <Badge variant={data.pair.score >= 0.9 ? "error" : "warning"}>{Math.round(data.pair.score * 100)}% match</Badge>
          {data.pair.reasons.map((r) => (
            <Badge key={r}>{r}</Badge>
          ))}
        </div>
      </div>
      <MergeWorkbench orgId={orgId} a={data.a} b={data.b} canMerge={canMerge} />
    </div>
  );
}
