import type { Metadata } from "next";
import Link from "next/link";
import { getOrg, listMerges } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge, EmptyState, Heading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { UndoMergeButton } from "@/components/dedupe/undo-merge-button";

export const metadata: Metadata = { title: "Merge history" };

export default async function MergesPage({ params }: PageProps<"/app/orgs/[orgId]/merges">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [merges, org] = await withSession(session, (tx) => Promise.all([listMerges(tx, orgId), getOrg(tx, orgId)]));
  const canUndo = org?.role === "owner" || org?.role === "admin";
  const base = `/app/orgs/${orgId}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`${base}/health`} className={`${anchorClass} text-30`}>
          Data health
        </Link>
        <Heading variant="heading30" as="h1" noMargin className="mt-1">
          Merge history
        </Heading>
      </div>
      {merges.length === 0 ? (
        <EmptyState title="No merges yet" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Merged</TH>
              <TH>Into</TH>
              <TH>By</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {merges.map((m) => {
              const open = !m.reversedAt && new Date(m.reversibleUntil) > new Date();
              return (
                <TR key={m.id}>
                  <TD className="text-text-weak">{formatDateTime(m.createdAt)}</TD>
                  <TD>{m.mergedDisplayName}</TD>
                  <TD>
                    {m.survivingName ? (
                      <Link href={`${base}/constituents/${m.survivingId}`} className={anchorClass}>
                        {m.survivingName}
                      </Link>
                    ) : (
                      <span className="text-text-weak">(record removed)</span>
                    )}
                  </TD>
                  <TD className="text-text-weak">{m.createdByName ?? ""}</TD>
                  <TD>{m.reversedAt ? <Badge>Undone {formatDate(m.reversedAt)}</Badge> : open ? <Badge variant="success">Undo until {formatDate(m.reversibleUntil)}</Badge> : <Badge>Final</Badge>}</TD>
                  <TD align="right">{open && canUndo && <UndoMergeButton orgId={orgId} mergeId={m.id} mergedName={m.mergedDisplayName} />}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
