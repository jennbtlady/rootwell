import type { Metadata } from "next";
import Link from "next/link";
import { GIFT_FILTERS, listGifts, type GiftFilter } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, EmptyState, Heading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { ListPager } from "@/components/constituents/list-pager";

export const metadata: Metadata = { title: "Gifts" };
const PAGE = 50;
const TITLE: Record<GiftFilter, string> = { missing_fund: "Gifts with no fund", unacknowledged: "Unthanked gifts older than 14 days" };

export default async function GiftsPage({ params, searchParams }: PageProps<"/app/orgs/[orgId]/gifts">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const filter = typeof sp.filter === "string" && (GIFT_FILTERS as readonly string[]).includes(sp.filter) ? (sp.filter as GiftFilter) : undefined;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const session = await requireSession();
  const { items, total } = await withSession(session, (tx) => listGifts(tx, orgId, { filter, limit: PAGE, offset: (page - 1) * PAGE }));
  const base = `/app/orgs/${orgId}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          {filter ? TITLE[filter] : "All gifts"}
        </Heading>
        <div className="mt-1 flex flex-wrap gap-3 text-30">
          <Link href={`${base}/gifts`} className={anchorClass}>
            All gifts
          </Link>
          <Link href={`${base}/batches`} className={anchorClass}>
            Batches
          </Link>
          {filter && (
            <span className="text-text-weak">
              {total} gift{total === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState title={filter ? "Nothing here. Good." : "No gifts yet"} />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Donor</TH>
                <TH align="right">Amount</TH>
                <TH>Fund</TH>
                <TH>Campaign</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((g) => (
                <TR key={g.id}>
                  <TD>
                    {g.batchId ? (
                      <Link href={`${base}/batches/${g.batchId}`} className={anchorClass}>
                        {formatDate(g.giftDate)}
                      </Link>
                    ) : (
                      formatDate(g.giftDate)
                    )}
                  </TD>
                  <TD>
                    <Link href={`${base}/constituents/${g.constituentId}`} className={anchorClass + " font-medium"}>
                      {g.constituentName}
                    </Link>
                  </TD>
                  <TD align="right">{formatMoney(g.amount)}</TD>
                  <TD className={g.fundName ? "" : "text-text-warning"}>{g.fundName ?? "No fund"}</TD>
                  <TD className="text-text-weak">{g.campaignName ?? ""}</TD>
                  <TD>
                    {g.postedAt ? <Badge variant="success">Posted</Badge> : <Badge variant="warning">Open</Badge>}
                    {g.postedAt && !g.acknowledgedAt && (
                      <Badge className="ml-1" variant="neutral">
                        Not thanked
                      </Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <ListPager base={filter ? `${base}/gifts?filter=${filter}` : `${base}/gifts`} page={page} pageCount={Math.max(1, Math.ceil(total / PAGE))} />
        </>
      )}
    </div>
  );
}
