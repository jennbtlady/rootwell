import type { Metadata } from "next";
import Link from "next/link";
import { CONSTITUENT_FILTERS, getOrg, listConstituents, type ConstituentFilter } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, buttonVariants, EmptyState, Heading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { ConstituentSearch } from "@/components/constituents/constituent-search";
import { ListPager } from "@/components/constituents/list-pager";

export const metadata: Metadata = { title: "Donors" };
const PAGE = 50;

export default async function ConstituentsPage({ params, searchParams }: PageProps<"/app/orgs/[orgId]/constituents">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const filter = typeof sp.filter === "string" && (CONSTITUENT_FILTERS as readonly string[]).includes(sp.filter) ? (sp.filter as ConstituentFilter) : undefined;
  const session = await requireSession();
  const [{ items, total }, org] = await withSession(session, (tx) => Promise.all([listConstituents(tx, orgId, { q, limit: PAGE, offset: (page - 1) * PAGE, filter }), getOrg(tx, orgId)]));
  const canImport = org?.role === "owner" || org?.role === "admin";
  const base = `/app/orgs/${orgId}/constituents`;
  const FILTER_TITLE: Record<ConstituentFilter, string> = { missing_email: "Donors with no email", missing_address: "Donors with no address", stale: "No gift or note in 36 months" };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading variant="heading30" as="h1" noMargin>
            {filter ? FILTER_TITLE[filter] : "All donors"}
          </Heading>
          {filter && (
            <Link href={base} className={`${anchorClass} text-30`}>
              Show everyone
            </Link>
          )}
        </div>
        <div className="flex gap-2">
          {canImport && (
            <Link href={`/app/orgs/${orgId}/imports/new`} className={buttonVariants({ variant: "secondary", size: "small" })}>
              Import a spreadsheet
            </Link>
          )}
          <Link href={`${base}/new`} className={buttonVariants({ size: "small" })}>
            Add a donor
          </Link>
        </div>
      </div>
      <ConstituentSearch base={base} initial={q} />

      {items.length === 0 ? (
        q ? (
          <EmptyState title="No one matches that search">Try fewer letters, or search by email or phone.</EmptyState>
        ) : (
          <EmptyState
            title="No donors yet"
            action={
              <Link href={`${base}/new`} className={buttonVariants()}>
                Add your first donor
              </Link>
            }
          >
            Donors, members, volunteers and organizations all live here. Add them one at a time, or import a spreadsheet.
          </EmptyState>
        )
      ) : (
        <>
          <p className="text-30 leading-5 text-text-weak">
            {q ? `${total} match${total === 1 ? "" : "es"}` : `${total} donor${total === 1 ? "" : "s"}`}
          </p>
          <Table label="Donors">
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Phone</TH>
                <TH>City</TH>
                <TH align="right">Last gift</TH>
                <TH align="right">Lifetime</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`${base}/${c.id}`} className={anchorClass + " font-medium"}>
                      {c.sortName}
                    </Link>
                    {c.type !== "person" && (
                      <Badge className="ml-2" variant="decorative10">
                        {c.type === "household" ? "Household" : "Organization"}
                      </Badge>
                    )}
                    {c.deceased && (
                      <Badge className="ml-2" variant="default">
                        Deceased
                      </Badge>
                    )}
                    {c.doNotContact && (
                      <Badge className="ml-2" variant="warning">
                        Do not contact
                      </Badge>
                    )}
                  </TD>
                  <TD className="text-text-weak">{c.primaryEmail ?? ""}</TD>
                  <TD className="text-text-weak">{c.primaryPhone ?? ""}</TD>
                  <TD className="text-text-weak">{[c.city, c.state].filter(Boolean).join(", ")}</TD>
                  <TD align="right" className="text-text-weak">
                    {formatDate(c.lastGiftOn)}
                  </TD>
                  <TD align="right">{c.giftCount ? formatMoney(c.lifetimeTotal) : ""}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {!q && <ListPager base={filter ? `${base}?filter=${filter}` : base} page={page} pageCount={Math.max(1, Math.ceil(total / PAGE))} />}
        </>
      )}
    </div>
  );
}
