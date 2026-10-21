import type { DashboardData } from "@maple/core/services";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, Heading } from "@/components/ui";
import { Definition } from "./definition";

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
export const num = (v: number | string) => Number(v);

export function Delta({ now, before, money }: { now: number; before: number; money?: boolean }) {
  if (!before) return <span className="text-30 text-text-weak">No gifts in the same period last year</span>;
  const change = Math.round(((now - before) / before) * 100);
  const up = change >= 0;
  return (
    <span className="text-30 leading-5 text-text-weak">
      <span className={cn("font-semibold", up ? "text-text-success" : "text-text-error")}>
        {up ? "Up" : "Down"} {Math.abs(change)}%
      </span>{" "}
      from {money ? formatMoney(before) : before.toLocaleString()} last year to date
    </span>
  );
}

export function Tile({ label, value, children, definition }: { label: string; value: string; children?: React.ReactNode; definition?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4 sm:p-5 print:break-inside-avoid print:border-border-weak">
      <div className="flex items-center gap-1 text-20 font-semibold uppercase tracking-wide text-text-weak">
        {label}
        {definition && <Definition label={label} text={definition} />}
      </div>
      <div className="text-80 font-semibold leading-10 tabular-nums">{value}</div>
      {children}
    </Card>
  );
}

/** Single series, magnitude, sorted: horizontal bars in one hue with direct value labels. */
export function Bars({ title, rows }: { title: string; rows: { name: string; total: number | string; gifts: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => num(r.total)));
  const shown = rows.slice(0, 8);
  const other = rows.slice(8).reduce((s, r) => s + num(r.total), 0);
  return (
    <Card className="p-4 sm:p-5 print:break-inside-avoid">
      <Heading variant="heading40" as="h2">
        {title}
      </Heading>
      {rows.length === 0 ? (
        <p className="text-30 text-text-weak">No gifts yet this year.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...shown, ...(other ? [{ name: "All others", total: other, gifts: 0 }] : [])].map((r) => (
            <li key={r.name} className="group grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-30 leading-5" title={`${r.name}: ${formatMoney(r.total)}${r.gifts ? `, ${r.gifts} gifts` : ""}`}>
              <span className="truncate">{r.name}</span>
              <span className="h-4 rounded-r-20 bg-background-primary transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(2, (num(r.total) / max) * 100)}%` }} aria-hidden="true" />
              <span className="tabular-nums text-text">{formatMoney(r.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Emphasis form: this year in the accent, last year in gray for context. One axis. */
export function MonthChart({ rows, asOf }: { rows: DashboardData["byMonth"]; asOf: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [num(r.current), num(r.prior)]));
  const W = 640, H = 200, padL = 48, padB = 24, padT = 8;
  const bw = (W - padL) / rows.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, max / 2, max];
  return (
    <Card className="p-4 sm:p-5 print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading variant="heading40" as="h2" noMargin>
          Dollars by month
        </Heading>
        <div className="flex gap-4 text-30 text-text-weak" aria-hidden="true">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-10 bg-background-primary" /> This fiscal year
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-10 bg-background-stronger" /> Last fiscal year
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Dollars received each month this fiscal year and last. The table below has the numbers.">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="stroke-border-weaker" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-text-weak text-[10px]">
              {t >= 1000 ? `$${Math.round(t / 100) / 10}k` : `$${Math.round(t)}`}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = padL + i * bw;
          const w = (bw - 8) / 2;
          return (
            <g key={r.label} className="group">
              <title>{`${r.label}: ${formatMoney(r.current)} this year, ${formatMoney(r.prior)} last year`}</title>
              <rect x={x} y={padT} width={bw} height={H - padT - padB} className="fill-transparent group-hover:fill-background-weak" />
              <rect x={x + 3} y={y(num(r.prior))} width={w} height={Math.max(0, H - padB - y(num(r.prior)))} rx={2} className="fill-background-stronger" />
              <rect x={x + 5 + w} y={y(num(r.current))} width={w} height={Math.max(0, H - padB - y(num(r.current)))} rx={2} className="fill-background-primary" />
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-text-weak text-[10px]">
                {r.label}
              </text>
            </g>
          );
        })}
      </svg>
      <details className="mt-2 text-30">
        <summary className="cursor-pointer text-text-link">Show as a table</summary>
        <table className="mt-2 w-full text-30">
          <thead>
            <tr className="text-left text-text-weak">
              <th className="py-1 font-semibold">Month</th>
              <th className="py-1 text-right font-semibold">This year</th>
              <th className="py-1 text-right font-semibold">Last year</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border-weaker">
                <td className="py-1">{r.label}</td>
                <td className="py-1 text-right tabular-nums">{formatMoney(r.current)}</td>
                <td className="py-1 text-right tabular-nums">{formatMoney(r.prior)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-text-weak">This year runs through {formatDate(asOf)}.</p>
      </details>
    </Card>
  );
}

export const DEF = {
  donors: "People and organizations with at least one posted gift this fiscal year. Soft credits and pledges are not counted; pledge payments are.",
  dollars: "Total of posted gifts this fiscal year, compared with the same dates last year.",
  median: "Half of this year's gifts are larger than this and half are smaller. Less swayed by one big gift than the average.",
  newRepeat: "New donors gave their first gift ever this fiscal year. Repeat donors had given before.",
  overall: "Fundraising Effectiveness Project definition: donors from the earlier year who gave again in the later year, divided by donors in the earlier year. Measured over the last two completed fiscal years. Some donor tools count a donor who gives at any later time instead, which gives a higher number; the two cannot be compared.",
  firstTime: "Fundraising Effectiveness Project definition: of donors whose first gift ever was in the earlier year, the share who gave again in the later year. The national figure has been under 20% for years. Some donor tools count a donor who gives at any later time instead, which gives a higher number; the two cannot be compared.",
  repeat: "Fundraising Effectiveness Project definition: of donors in the earlier year who had also given before it, the share who gave again in the later year. Some donor tools count a donor who gives at any later time instead, which gives a higher number; the two cannot be compared.",
  lapsed: "Donors whose last gift was between 13 and 15 months ago: the window to win them back before they fall away.",
};

export function retentionRate(x: { base: number; retained: number }): string {
  const p = pct(x.retained, x.base);
  return p === null ? "No data" : `${p}%`;
}

export function retentionPeriod(data: DashboardData): string {
  const fy = (d: string) => `FY${Number(d.slice(0, 4)) + (d.slice(5, 7) === "01" ? 0 : 1)}`;
  return `${fy(data.retentionPeriod.earlierStart)} to ${fy(data.retentionPeriod.laterStart)}`;
}

/** The answer to "are we on track?" in words, before any chart. */
export function headline(data: DashboardData): string {
  const now = num(data.dollarsYtd);
  const before = num(data.dollarsPriorYtd);
  const donors = `${data.donorsYtd.toLocaleString()} ${data.donorsYtd === 1 ? "donor has" : "donors have"} given, compared with ${data.donorsPriorYtd.toLocaleString()} at this point last year.`;
  if (!before && !now) return "No gifts have been recorded this fiscal year or the same time last year yet.";
  if (!before) return `${formatMoney(now)} has come in so far this fiscal year. There were no gifts in the same period last year to compare with. ${donors}`;
  const change = Math.round(((now - before) / before) * 100);
  const how = change === 0 ? "about the same as" : change > 0 ? `up ${change}% compared with` : `down ${Math.abs(change)}% compared with`;
  return `Giving is ${how} this time last year: ${formatMoney(now)} so far this fiscal year, against ${formatMoney(before)} by the same date last year. ${donors}`;
}

/** Progress toward each active campaign goal. A bar per campaign, with the words beside it. */
export function CampaignGoals({ goals }: { goals: NonNullable<DashboardData["campaignGoals"]> }) {
  return (
    <Card className="p-4 sm:p-5 print:break-inside-avoid">
      <Heading variant="heading40" as="h2">
        Campaign goals
      </Heading>
      {goals.length === 0 ? (
        <p className="text-30 leading-5 text-text-weak">No active campaigns with a goal. Set a goal on a campaign under Settings, Funds, campaigns, appeals.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {goals.map((g) => {
            const share = num(g.goal) ? Math.min(100, Math.round((num(g.raised) / num(g.goal)) * 100)) : 0;
            return (
              <li key={g.name} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-30 leading-5">
                  <span className="font-semibold">{g.name}</span>
                  <span className="tabular-nums">
                    {formatMoney(g.raised)} of {formatMoney(g.goal)} <span className="text-text-weak">({share}%)</span>
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-pill bg-background-stronger" role="img" aria-label={`${g.name}: ${share}% of the goal`}>
                  <div className="h-full rounded-pill bg-background-primary" style={{ width: `${share}%` }} />
                </div>
                {g.ends_on && <span className="text-20 text-text-weak">Ends {formatDate(g.ends_on)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
