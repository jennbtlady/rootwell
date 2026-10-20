import type { Metadata } from "next";
import Link from "next/link";
import { getOrg, listBatches } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, EmptyState, Heading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { NewBatchForm } from "@/components/gifts/new-batch-form";

export const metadata: Metadata = { title: "Gifts" };

export default async function BatchesPage({ params }: PageProps<"/app/orgs/[orgId]/batches">) {
  const { orgId } = await params;
  const session = await requireSession();
  const { batches, org } = await withSession(session, async (tx) => ({ batches: await listBatches(tx, orgId), org: await getOrg(tx, orgId) }));
  const base = `/app/orgs/${orgId}/batches`;
  const open = batches.filter((b) => b.status === "open");
  const posted = batches.filter((b) => b.status === "posted");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading variant="heading30" as="h1" noMargin>
            Gift batches
          </Heading>
          <p className="mt-1 text-30 leading-5 text-text-weak">Gifts are entered into a dated batch. {org?.role === "staff" ? "An admin posts it once it matches the deposit." : "Post a batch once it matches the deposit."}</p>
        </div>
        <NewBatchForm orgId={orgId} />
      </div>

      <section className="flex flex-col gap-3">
        <Heading variant="heading40" as="h2" noMargin>
          Open
        </Heading>
        {open.length === 0 ? (
          <EmptyState title="No open batches">Start a batch to enter today&apos;s gifts.</EmptyState>
        ) : (
          <BatchTable base={base} batches={open} />
        )}
      </section>

      {posted.length > 0 && (
        <section className="flex flex-col gap-3">
          <Heading variant="heading40" as="h2" noMargin>
            Posted
          </Heading>
          <BatchTable base={base} batches={posted} />
        </section>
      )}
    </div>
  );
}

function BatchTable({ base, batches }: { base: string; batches: Awaited<ReturnType<typeof listBatches>> }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Date</TH>
          <TH>Description</TH>
          <TH align="right">Gifts</TH>
          <TH align="right">Total</TH>
          <TH align="right">Expected</TH>
          <TH>Status</TH>
        </TR>
      </THead>
      <TBody>
        {batches.map((b) => {
          const matches = b.expectedTotal == null || Number(b.expectedTotal) === Number(b.giftTotal);
          return (
            <TR key={b.id}>
              <TD>
                <Link href={`${base}/${b.id}`} className={anchorClass + " font-medium"}>
                  {formatDate(b.batchDate)}
                </Link>
              </TD>
              <TD className="text-text-weak">{b.description ?? ""}</TD>
              <TD align="right">{b.giftCount}</TD>
              <TD align="right">{formatMoney(b.giftTotal)}</TD>
              <TD align="right" className={matches ? "text-text-weak" : "text-text-warning"}>
                {b.expectedTotal == null ? "" : formatMoney(b.expectedTotal)}
              </TD>
              <TD>{b.status === "posted" ? <Badge variant="success">Posted</Badge> : <Badge variant="warning">Open</Badge>}</TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
