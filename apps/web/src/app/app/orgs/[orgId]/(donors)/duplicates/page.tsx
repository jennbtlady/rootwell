import type { Metadata } from "next";
import Link from "next/link";
import { getOrg, listDuplicates } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { Badge, EmptyState, Heading, Paragraph } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { ScanButton } from "@/components/dedupe/scan-button";
import { PairActions } from "@/components/dedupe/pair-actions";

export const metadata: Metadata = { title: "Possible duplicates" };

export default async function DuplicatesPage({ params, searchParams }: PageProps<"/app/orgs/[orgId]/duplicates">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const status = sp.status === "not_duplicate" ? "not_duplicate" : "open";
  const session = await requireSession();
  const [pairs, org] = await withSession(session, (tx) => Promise.all([listDuplicates(tx, orgId, status), getOrg(tx, orgId)]));
  const base = `/app/orgs/${orgId}`;
  const canMerge = org?.role === "owner" || org?.role === "admin";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading variant="heading30" as="h1" noMargin>
            Possible duplicates
          </Heading>
          <Paragraph noMargin className="mt-1 text-text-weak">
            Highest confidence first. Compare a pair before merging. Merges can be undone for 30 days.
          </Paragraph>
        </div>
        <ScanButton orgId={orgId} />
      </div>
      <div className="flex gap-3 text-30">
        <Link href={`${base}/duplicates`} className={status === "open" ? "font-semibold text-text-primary" : anchorClass} aria-current={status === "open" ? "page" : undefined}>
          Open
        </Link>
        <Link href={`${base}/duplicates?status=not_duplicate`} className={status === "not_duplicate" ? "font-semibold text-text-primary" : anchorClass} aria-current={status === "not_duplicate" ? "page" : undefined}>
          Marked as different
        </Link>
      </div>

      {pairs.length === 0 ? (
        <EmptyState title={status === "open" ? "No possible duplicates" : "Nothing marked as different yet"}>
          {status === "open" ? "New records are checked as they are added. Run a scan after an import." : ""}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {pairs.map((p) => (
            <li key={p.id} className="rounded-30 border border-border-weaker bg-background-weakest p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={p.score >= 0.9 ? "error" : p.score >= 0.6 ? "warning" : "neutral"}>{Math.round(p.score * 100)}% match</Badge>
                {p.reasons.map((r) => (
                  <Badge key={r}>{r}</Badge>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[p.a, p.b].map((s) => (
                  <div key={s.id} className="text-30 leading-5">
                    <Link href={`${base}/constituents/${s.id}`} className={anchorClass + " font-semibold"}>
                      {s.displayName}
                    </Link>
                    <div className="text-text-weak">{[s.primaryEmail, s.city].filter(Boolean).join(" · ") || "No email or city"}</div>
                    <div className="text-text-weak">
                      {s.giftCount} gift{s.giftCount === 1 ? "" : "s"}
                      {s.lastGiftOn ? `, last ${formatDate(s.lastGiftOn)}` : ""} · added {formatDate(s.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <PairActions orgId={orgId} pairId={p.id} status={p.status} canMerge={canMerge} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
