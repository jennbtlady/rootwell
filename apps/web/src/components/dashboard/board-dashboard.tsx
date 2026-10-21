import type { DashboardData } from "@maple/core/services";
import { formatDate, formatMoney } from "@/lib/format";
import { Card, Heading } from "@/components/ui";
import { PrintedDefinitions } from "./definition";
import { Bars, CampaignGoals, DEF, Delta, MonthChart, Tile, headline, num, retentionPeriod, retentionRate } from "./dashboard-parts";

/**
 * The board dashboard (Ruth: "are we on track?", in two minutes). A sentence first, then
 * the comparison, goals, the trend, and where the money went. No to-do lists. It is what
 * board links and board viewers see; staff open it to see exactly the same thing.
 */
export function BoardDashboard({ data, showNames }: { data: DashboardData; showNames: boolean }) {
  const r = data.retention;
  const period = retentionPeriod(data);
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 sm:p-5">
        <p className="text-50 font-semibold leading-8">{headline(data)}</p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Dollars this fiscal year" value={formatMoney(data.dollarsYtd)} definition={DEF.dollars}>
          <Delta now={num(data.dollarsYtd)} before={num(data.dollarsPriorYtd)} money />
        </Tile>
        <Tile label="Donors this fiscal year" value={data.donorsYtd.toLocaleString()} definition={DEF.donors}>
          <Delta now={data.donorsYtd} before={data.donorsPriorYtd} />
        </Tile>
        <Tile label="Donor retention" value={retentionRate(r.overall)} definition={DEF.overall}>
          <span className="text-30 text-text-weak">
            {r.overall.retained} of {r.overall.base} donors came back, {period}
          </span>
        </Tile>
        <Tile label="New donors this fiscal year" value={data.newDonorsYtd.toLocaleString()} definition={DEF.newRepeat}>
          <span className="text-30 text-text-weak">
            {data.newDonorsYtd.toLocaleString()} new and {data.repeatDonorsYtd.toLocaleString()} returning
          </span>
        </Tile>
      </div>

      {data.campaignGoals && data.campaignGoals.length > 0 && <CampaignGoals goals={data.campaignGoals} />}
      <MonthChart rows={data.byMonth} asOf={data.asOf} />

      <div className="grid gap-3 lg:grid-cols-2">
        <Bars title="By fund this fiscal year" rows={data.byFund} />
        <Card className="p-4 sm:p-5 print:break-inside-avoid">
          <Heading variant="heading40" as="h2">
            Largest gifts this fiscal year
          </Heading>
          {data.topGifts.length === 0 ? (
            <p className="text-30 text-text-weak">No gifts yet this year.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-border-weaker text-30 leading-5">
              {data.topGifts.slice(0, 5).map((g, i) => (
                // Wraps rather than cuts off, so a large text size still shows the whole line.
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                  <span className="min-w-0 break-words">
                    {showNames ? g.name : "A donor"} <span className="text-text-weak">· {formatDate(g.date)}{g.fund ? ` · ${g.fund}` : ""}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatMoney(g.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
      <p className="text-20 text-text-weak">
        Your fiscal year started {formatDate(data.fiscalYearStart)}. Figures run through {formatDate(data.asOf)} and count posted gifts only.
      </p>
      <PrintedDefinitions
        items={[
          { label: "Dollars", text: DEF.dollars },
          { label: "Donors", text: DEF.donors },
          { label: "Donor retention", text: DEF.overall },
          { label: "New donors", text: DEF.newRepeat },
        ]}
      />
    </div>
  );
}
