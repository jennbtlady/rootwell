import Link from "next/link";
import type { DashboardData, StaffHome } from "@maple/core/services";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Card, Heading } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { CampaignGoals, DEF, Delta, Tile, num, retentionPeriod, retentionRate } from "./dashboard-parts";

/**
 * The staff dashboard on Home (Dana and Marcus: "what do I do next, and how are we doing").
 * To-dos first, each linking to the list that clears it. Then the numbers, then who to call.
 */
export function StaffDashboard({ base, data, live }: { base: string; data: DashboardData; live: StaffHome }) {
  const t = live.todos;
  const todos = [
    { n: t.toThank, label: t.toThank === 1 ? "gift to thank" : "gifts to thank", note: t.toThankNeedLetter ? `${t.toThankNeedLetter} of $250 or more need a written letter` : null, href: `${base}/acknowledgments`, urgent: t.toThankNeedLetter > 0 },
    { n: t.openBatches, label: t.openBatches === 1 ? "batch waiting to post" : "batches waiting to post", note: null, href: `${base}/batches`, urgent: false },
    { n: t.onlineAwaitingDeposit, label: t.onlineAwaitingDeposit === 1 ? "online gift waiting for its deposit" : "online gifts waiting for their deposit", note: "They join a batch when Stripe pays out", href: `${base}/gifts`, urgent: false },
    { n: t.onlineNeedsAttention, label: t.onlineNeedsAttention === 1 ? "online gift needs a look" : "online gifts need a look", note: "Refunds and other changes", href: `${base}/health`, urgent: true },
    { n: t.possibleDuplicates, label: t.possibleDuplicates === 1 ? "possible duplicate" : "possible duplicates", note: null, href: `${base}/duplicates`, urgent: false },
  ].filter((x) => x.n > 0);
  const r = data.retention;
  const period = retentionPeriod(data);

  // No gifts recorded yet: a clear starting point, not a dashboard of zeros. The figures
  // appear once there is something to show.
  if (live.recentGifts.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="p-5 sm:p-6">
          <Heading variant="heading30" as="h2" noMargin>
            Ready for your first gift
          </Heading>
          <p className="mt-2 max-w-2xl text-40 leading-6">
            Take this week&apos;s checks and enter them together, the way they went to the bank. Once gifts are in, this page shows what to do next and how the year is going.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`${base}/batches`} className={buttonVariants()}>
              Enter your first gifts
            </Link>
            <Link href={`${base}/constituents/new`} className={buttonVariants({ variant: "secondary" })}>
              Add a donor
            </Link>
          </div>
        </Card>
        {(data.campaignGoals ?? []).length > 0 && <CampaignGoals goals={data.campaignGoals ?? []} />}
        <Card className="p-4 sm:p-5">
          <Heading variant="heading40" as="h2">
            While you wait for gifts
          </Heading>
          <ul className="flex flex-col gap-2 text-30 leading-5">
            <li>
              <Link className="text-text-link underline" href={`${base}/settings/board`}>
                Make a board link
              </Link>{" "}
              so your board can see progress without a sign-in.
            </li>
            <li>
              <Link className="text-text-link underline" href={`${base}/settings/integrations`}>
                Take gifts online
              </Link>{" "}
              with a giving page. Optional.
            </li>
            <li>
              <Link className="text-text-link underline" href="/app/help">
                Read the short guides
              </Link>{" "}
              to everyday tasks.
            </li>
          </ul>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="todo-h" className="flex flex-col gap-2">
        <Heading id="todo-h" variant="heading40" as="h2" noMargin>
          To do
        </Heading>
        {todos.length === 0 ? (
          <Card className="p-4">
            <p className="text-30 leading-5">Nothing waiting. Every posted gift is thanked and every batch is posted.</p>
          </Card>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {todos.map((x) => (
              <li key={x.label}>
                <Link href={x.href} className="flex h-full items-center gap-3 rounded-30 border border-border-weaker bg-background-weakest p-3 outline-none hover:shadow-border-primary focus-visible:shadow-focus">
                  <span className={cn("min-w-10 text-center text-60 font-semibold tabular-nums", x.urgent ? "text-text-warning" : "text-text-primary")}>{x.n.toLocaleString()}</span>
                  <span className="flex flex-col">
                    <span className="text-30 font-semibold leading-5">{x.label}</span>
                    {x.note && <span className="text-20 leading-4 text-text-weak">{x.note}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="how-h" className="flex flex-col gap-2">
        <Heading id="how-h" variant="heading40" as="h2" noMargin>
          How this fiscal year is going
        </Heading>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Dollars this fiscal year" value={formatMoney(data.dollarsYtd)} definition={DEF.dollars}>
            <Delta now={num(data.dollarsYtd)} before={num(data.dollarsPriorYtd)} money />
          </Tile>
          <Tile label="Donors this fiscal year" value={data.donorsYtd.toLocaleString()} definition={DEF.donors}>
            <Delta now={data.donorsYtd} before={data.donorsPriorYtd} />
          </Tile>
          <Tile label="Donor retention" value={retentionRate(r.overall)} definition={DEF.overall}>
            <span className="text-30 text-text-weak">
              {r.overall.retained} of {r.overall.base} donors gave again, {period}
            </span>
          </Tile>
          <Tile label="First-time donor retention" value={retentionRate(r.firstTime)} definition={DEF.firstTime}>
            <span className="text-30 text-text-weak">A quick thank-you call is the best way to raise this.</span>
          </Tile>
        </div>
      </section>

      <section aria-labelledby="who-h" className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <Heading id="who-h" variant="heading40" as="h2">
            Who to reach out to
          </Heading>
          <ul className="flex flex-col gap-2 text-30 leading-5">
            <li className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <strong className="tabular-nums">{(data.lybunt ?? 0).toLocaleString()}</strong> gave last year, not yet this year
              </span>
              <Link href={`${base}/reports/lybunt`} className="text-text-link underline">
                See the list<span className="sr-only">: gave last year, not yet this year</span>
              </Link>
            </li>
            <li className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <strong className="tabular-nums">{data.lapsed.count.toLocaleString()}</strong> last gave 13 to 15 months ago
              </span>
              <Link href={`${base}/reports/lapsed`} className="text-text-link underline">
                See the list<span className="sr-only">: lapsed donors</span>
              </Link>
            </li>
          </ul>
          {live.topNotYet.length > 0 && (
            <>
              <h3 className="mt-4 text-30 font-semibold">Last year&apos;s top donors who have not given yet this year</h3>
              <ol className="mt-1 flex flex-col divide-y divide-border-weaker text-30 leading-5">
                {live.topNotYet.map((d) => (
                  <li key={d.constituentId} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`${base}/constituents/${d.constituentId}`} className="min-w-0 truncate text-text-link underline-offset-2 hover:underline">
                      {d.name}
                    </Link>
                    <span className="shrink-0 text-text-weak">
                      <span className="font-semibold tabular-nums text-text">{formatMoney(d.lastYear)}</span> last year
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Card>
        <CampaignGoals goals={data.campaignGoals ?? []} />
      </section>

      <Card className="p-4 sm:p-5">
        <Heading variant="heading40" as="h2">
          Recent gifts
        </Heading>
        {live.recentGifts.length === 0 ? (
          <p className="text-30 text-text-weak">No gifts yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-weaker text-30 leading-5">
            {live.recentGifts.map((g) => (
              <li key={g.giftId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  <Link href={`${base}/constituents/${g.constituentId}`} className="text-text-link underline-offset-2 hover:underline">
                    {g.name}
                  </Link>{" "}
                  <span className="text-text-weak">
                    · {formatDate(g.date)}
                    {g.fund ? ` · ${g.fund}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {g.online && <Badge variant="new">Online</Badge>}
                  {!g.posted && <Badge>Not posted</Badge>}
                  <span className="font-semibold tabular-nums">{formatMoney(g.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-20 text-text-weak">
        Your fiscal year started {formatDate(data.fiscalYearStart)}. Totals count posted gifts through {formatDate(data.asOf)}. To-dos are live. The board sees a simpler view under Reports, Board dashboard.
      </p>
    </div>
  );
}
