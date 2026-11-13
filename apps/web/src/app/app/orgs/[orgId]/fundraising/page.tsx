import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fundraisingOverview, getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDate, formatMoney } from "@/lib/format";
import { anchorClass, Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Heading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { GiftExtras } from "@/components/gifts/gift-extras";

export const metadata: Metadata = { title: "Fundraising" };

/**
 * Fundraising, Overview: how online giving is going this year, what is left to set up, and
 * the latest online gifts. Each gift links to the donor's record in the CRM.
 */
export default async function FundraisingOverviewPage({ params }: PageProps<"/app/orgs/[orgId]/fundraising">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [org, o] = await withSession(session, (tx) => Promise.all([getOrg(tx, orgId), fundraisingOverview(tx, orgId)]));
  if (!org || !o) notFound();
  const canEdit = org.role === "owner" || org.role === "admin";
  const base = `/app/orgs/${orgId}`;

  const steps = [
    { done: o.setup.stripe === "connected", label: o.setup.stripe === "needs_info" ? "Finish your Stripe setup" : "Connect Stripe", href: `${base}/settings/integrations`, help: "So your pages can take gifts by card." },
    { done: o.setup.hasPage, label: "Make a giving page", href: `${base}/fundraising/pages/new`, help: "One page for general gifts is a good start." },
    { done: o.setup.branded, label: "Add your colors and logo", href: `${base}/settings/branding`, help: "So donors know the page is yours." },
    { done: o.setup.receiptsReplyTo, label: "Choose where receipt replies go", href: `${base}/settings/receipts`, help: "Donors sometimes answer their receipt." },
  ];
  const left = steps.filter((s) => !s.done);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          Fundraising
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">Money raised online through your giving pages. Every gift also lands on the donor&rsquo;s record in the CRM.</p>
      </div>

      {canEdit && left.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Get ready to take gifts online</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {steps.map((s) => (
                <li key={s.label} className="flex flex-wrap items-center gap-2">
                  {s.done ? <Badge variant="success">Done</Badge> : <Badge>To do</Badge>}
                  {s.done ? (
                    <span className="text-30">{s.label}</span>
                  ) : (
                    <Link href={s.href} className={anchorClass + " text-30 font-medium"}>
                      {s.label}
                    </Link>
                  )}
                  {!s.done && <span className="text-30 text-text-weak">{s.help}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-30 text-text-weak">Raised online this year</p>
          <p className="text-60 font-semibold">{formatMoney(o.onlineTotal)}</p>
          <p className="text-30 text-text-weak">
            {o.onlineGifts === 1 ? "1 gift" : `${o.onlineGifts} gifts`} from {o.onlineDonors === 1 ? "1 donor" : `${o.onlineDonors} donors`}, since {formatDate(o.fiscalYearStart)}
          </p>
        </Card>
        <Card>
          <p className="text-30 text-text-weak">Monthly donors</p>
          <p className="text-60 font-semibold">{o.monthlyDonors}</p>
          <p className="text-30 text-text-weak">{formatMoney(o.monthlyPerMonth)} a month in all</p>
        </Card>
        <Card>
          <p className="text-30 text-text-weak">Giving pages on</p>
          <p className="text-60 font-semibold">{o.pagesOn}</p>
          <p className="text-30">
            <Link href={`${base}/fundraising/pages`} className={anchorClass}>
              See giving pages
            </Link>
          </p>
        </Card>
      </div>

      <section aria-labelledby="recent-online" className="flex flex-col gap-2">
        <Heading variant="heading40" as="h2" id="recent-online" noMargin>
          Latest online gifts
        </Heading>
        {o.recent.length === 0 ? (
          <EmptyState title="No online gifts yet" action={canEdit && !o.setup.hasPage ? <Link href={`${base}/fundraising/pages/new`} className={buttonVariants({ variant: "primary" })}>Make a giving page</Link> : undefined}>
            Gifts made on your giving pages show up here as soon as they come in.
          </EmptyState>
        ) : (
          <Table label="Latest online gifts">
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Donor</TH>
                <TH align="right">Amount</TH>
                <TH>For</TH>
              </TR>
            </THead>
            <TBody>
              {o.recent.map((g) => (
                <TR key={g.id}>
                  <TD className="text-text-weak">{formatDate(g.giftDate)}</TD>
                  <TD>
                    <Link href={`${base}/constituents/${g.constituentId}`} className={anchorClass + " font-medium"}>
                      {g.name}
                    </Link>
                  </TD>
                  <TD align="right">
                    {formatMoney(g.amount)}
                    {g.giftType === "refund" && (
                      <Badge className="ml-1" variant="neutral">
                        Refund
                      </Badge>
                    )}
                  </TD>
                  <TD>
                    {g.fund ?? ""}
                    <GiftExtras g={g} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <p className="text-30">
          <Link href={`${base}/gifts`} className={anchorClass}>
            See every gift in the CRM
          </Link>
        </p>
      </section>
    </div>
  );
}
