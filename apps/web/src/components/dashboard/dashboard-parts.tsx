import { layoutRows, type DashboardView, type LayoutItem } from "@maple/core";
import type { DashboardData } from "@maple/core/services";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, Heading } from "@/components/ui";
import { daysLeft, monthIndex, pacing, timeElapsed } from "@/lib/dashboard-math";
import { MonthBars, PacingChart } from "./charts";
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

export function Tile({ label, value, children, definition, trend }: { label: string; value: string; children?: React.ReactNode; definition?: string; trend?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-4 sm:p-5 print:break-inside-avoid print:border-border-weak">
      <div className="flex items-center gap-1 text-20 font-semibold uppercase tracking-wide text-text-weak">
        {label}
        {definition && <Definition label={label} text={definition} />}
      </div>
      <div className="text-80 font-semibold leading-10 tabular-nums">{value}</div>
      {children}
      {trend && <div className="mt-auto pt-2">{trend}</div>}
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
        <p className="text-30 text-text-weak">No gifts yet this fiscal year.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...shown, ...(other ? [{ name: "All others", total: other, gifts: 0 }] : [])].map((r) => (
            // Name and amount share the first line and may wrap; the bar has a line to itself.
            // This holds up at 200% text size, where a fixed name column pushed the amount off the card.
            <li key={r.name} className="group flex flex-col gap-1 text-30 leading-5" title={`${r.name}: ${formatMoney(r.total)}${r.gifts ? `, ${r.gifts} gifts` : ""}`}>
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 break-words">{r.name}</span>
                <span className="tabular-nums text-text">{formatMoney(r.total)}</span>
              </span>
              <span className="h-3 rounded-r-20 bg-data-visualization-1 transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(2, (num(r.total) / max) * 100)}%` }} aria-hidden="true" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Emphasis form: this year in the accent, last year as quieter context. One axis. */
export function MonthChart({ rows, asOf }: { rows: DashboardData["byMonth"]; asOf: string }) {
  const data = rows.map((r) => ({ label: r.label, current: num(r.current), prior: num(r.prior) }));
  const best = data.reduce((b, r) => (r.current > b.current ? r : b), data[0] ?? { label: "", current: 0, prior: 0 });
  return (
    <Card className="p-4 sm:p-5 print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading variant="heading40" as="h2" noMargin>
          Dollars by month
        </Heading>
        <div className="flex gap-4 text-30 text-text-weak" aria-hidden="true">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-10 bg-data-visualization-1" /> This fiscal year
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-10 bg-data-visualization-2" /> Last fiscal year
          </span>
        </div>
      </div>
      <div className="mt-3">
        <MonthBars data={data} summary={`Dollars received each month this fiscal year and last. The best month so far this year was ${best.label}, with ${formatMoney(best.current)}. The table below has every month.`} />
      </div>
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

/**
 * The headline: dollars so far, how that compares with this point last year, and the
 * running total for both years. The line above the dashed one means "ahead".
 */
export function PacingCard({ data }: { data: DashboardData }) {
  const points = pacing(data.byMonth, data.fiscalYearStart, data.asOf);
  const now = num(data.dollarsYtd);
  const before = num(data.dollarsPriorYtd);
  const change = before ? Math.round(((now - before) / before) * 100) : null;
  const words = change === null ? "No gifts at this point last year to compare with" : change === 0 ? "Level with this time last year" : `${Math.abs(change)}% ${change > 0 ? "ahead of" : "behind"} this time last year`;
  return (
    <Card className="p-4 sm:p-6 print:break-inside-avoid">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading variant="heading40" as="h2" noMargin>
            Raised this fiscal year
          </Heading>
          <div className="mt-1 text-[2.75rem] font-semibold leading-none tracking-tight text-text-primary tabular-nums">{formatMoney(now)}</div>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-30 font-semibold", change !== null && change < 0 ? "bg-background-primary-weakest text-text-primary" : "bg-background-new-weakest text-text")}>
          <span aria-hidden="true">{change === null ? "" : change > 0 ? "\u2197" : change < 0 ? "\u2198" : "\u2192"}</span>
          {words}
        </span>
      </div>
      <div className="mt-4">
        <PacingChart data={points} summary={`Running total of gifts by month. ${formatMoney(now)} so far this fiscal year, against ${formatMoney(before)} by the same date last year. ${words}.`} />
      </div>
    </Card>
  );
}

/** A small trend line under a key number. Decorative: the number and its sentence carry the meaning. */
export function Sparkline({ values, kind = "line" }: { values: number[]; kind?: "line" | "bars" }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const W = 120, H = 28, max = Math.max(...values, 1);
  const x = (i: number) => (i / (values.length - 1)) * (W - 6) + 3;
  const y = (v: number) => H - 3 - (v / max) * (H - 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-full max-w-40" aria-hidden="true" preserveAspectRatio="none">
      {kind === "bars" ? (
        values.map((v, i) => {
          const w = (W - 4) / values.length - 3;
          return <rect key={i} x={2 + i * ((W - 4) / values.length)} y={y(v)} width={Math.max(2, w)} height={Math.max(1, H - 3 - y(v))} rx={2} className="fill-data-visualization-1" />;
        })
      ) : (
        <>
          <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-data-visualization-1" vectorEffect="non-scaling-stroke" />
          <circle cx={x(values.length - 1)} cy={y(values[values.length - 1]!)} r={3} className="fill-data-visualization-1 stroke-background-weakest" strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}

/** This year's months so far, for the trend lines. */
export function monthsSoFar(data: DashboardData) {
  const now = monthIndex(data.fiscalYearStart, data.asOf);
  return [...data.byMonth].sort((a, b) => a.month_index - b.month_index).filter((r) => r.month_index <= now);
}

/** One dot per donor from the earlier year; filled dots gave again. Over 60 donors, a bar instead. */
export function RetentionDots({ base, retained }: { base: number; retained: number }) {
  if (base === 0) return null;
  if (base > 60) {
    return (
      <div className="h-2 w-full overflow-hidden rounded-pill bg-background-strong" aria-hidden="true">
        <div className="h-full rounded-pill bg-data-visualization-1" style={{ width: `${(retained / base) * 100}%` }} />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1" aria-hidden="true">
      {Array.from({ length: base }, (_, i) => (
        <span key={i} className={cn("inline-block size-2.5 rounded-circle", i < retained ? "bg-data-visualization-1" : "bg-background-strong")} />
      ))}
    </div>
  );
}

/** This year's gifts by size, with the dollars each size brought in. */
export function GiftBands({ bands, total }: { bands: NonNullable<DashboardData["giftBands"]>; total: number }) {
  const max = Math.max(1, ...bands.map((b) => num(b.total)));
  // The largest size that has any gifts: "9 gifts of $1,000 or more brought in 41% of the total."
  const lead = bands.find((b) => num(b.total) > 0 && b.gifts > 0);
  const share = lead && total ? Math.round((num(lead.total) / total) * 100) : 0;
  return (
    <Card className="h-full p-4 sm:p-5 print:break-inside-avoid">
      <Heading variant="heading40" as="h2">
        Where the dollars came from
      </Heading>
      {!lead ? (
        <p className="text-30 text-text-weak">No gifts yet this fiscal year.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {bands.map((b) => (
              <li key={b.label} className="flex flex-col gap-1 text-30 leading-5" title={`${b.gifts} ${b.gifts === 1 ? "gift" : "gifts"}, ${formatMoney(b.total)}`}>
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span>
                    {b.label} <span className="text-text-weak">· {b.gifts.toLocaleString()} {b.gifts === 1 ? "gift" : "gifts"}</span>
                  </span>
                  <span className="tabular-nums">{formatMoney(b.total)}</span>
                </span>
                <span className="h-2.5 rounded-r-20 bg-data-visualization-1" style={{ width: `${Math.max(1, (num(b.total) / max) * 100)}%`, opacity: num(b.total) ? 1 : 0.25 }} aria-hidden="true" />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-30 leading-5 text-text-weak">
            {lead.gifts.toLocaleString()} {lead.gifts === 1 ? "gift" : "gifts"} of {lead.label.replace(/^Under/, "under")} brought in {share}% of the total.
          </p>
        </>
      )}
    </Card>
  );
}

export const DEF = {
  donors: "People and organizations with at least one posted gift this fiscal year. Soft credits and pledges are not counted; pledge payments are.",
  dollars: "Total of posted gifts this fiscal year, compared with the same dates last year.",
  median: "Half of this year's gifts are larger than this and half are smaller. Less swayed by one big gift than the average.",
  newRepeat: "New donors gave their first gift ever this fiscal year. Returning donors had given before.",
  overall: "Of the donors who gave in one fiscal year, the share who gave again the next year. We compare the last two full fiscal years. Other donor tools may count this differently, so their numbers are not comparable. This is the Fundraising Effectiveness Project method.",
  firstTime: "Of the people who gave for the first time ever in one fiscal year, the share who gave again the next year. Nationally this has been under 20% for years. This is the Fundraising Effectiveness Project method.",
  repeat: "Of the donors who had given before, the share who gave again the next year. This is the Fundraising Effectiveness Project method.",
  lapsed: "Donors whose last gift was between 13 and 15 months ago: the window to win them back before they fall away.",
};

export function retentionRate(x: { base: number; retained: number }): string {
  const p = pct(x.retained, x.base);
  return p === null ? "No data" : `${p}%`;
}

/** "comparing fiscal years 2024 and 2025", or "2024-25 and 2025-26" when the year does not start in January. */
export function retentionPeriod(data: DashboardData): string {
  const fy = (d: string) => {
    const y = Number(d.slice(0, 4));
    return d.slice(5, 7) === "01" ? `${y}` : `${y}-${String(y + 1).slice(2)}`;
  };
  return `comparing fiscal years ${fy(data.retentionPeriod.earlierStart)} and ${fy(data.retentionPeriod.laterStart)}`;
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
export function CampaignGoals({ goals, asOf }: { goals: NonNullable<DashboardData["campaignGoals"]>; asOf?: string }) {
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
            // Where the campaign is in its own dates, so the bar answers "are we on pace?"
            const elapsed = asOf ? timeElapsed(g.starts_on, g.ends_on, asOf) : null;
            const left = asOf ? daysLeft(g.ends_on, asOf) : null;
            return (
              <li key={g.name} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-30 leading-5">
                  <span className="font-semibold">{g.name}</span>
                  <span className="tabular-nums">
                    {formatMoney(g.raised)} of {formatMoney(g.goal)} <span className="text-text-weak">({share}%)</span>
                  </span>
                </div>
                <div className="relative" role="img" aria-label={`${g.name}: ${share}% of the goal${elapsed !== null ? `, with ${elapsed}% of the campaign's time gone` : ""}`}>
                  <div className="h-3 w-full overflow-hidden rounded-pill bg-background-primary-weakest shadow-border-primary-weaker">
                    <div className="h-full rounded-pill bg-data-visualization-1" style={{ width: `${share}%` }} />
                  </div>
                  {elapsed !== null && elapsed > 0 && elapsed < 100 && <span className="absolute -top-1 h-5 border-l-2 border-text" style={{ left: `${elapsed}%` }} aria-hidden="true" />}
                </div>
                <span className="text-20 leading-4 text-text-weak">
                  {elapsed !== null && elapsed < 100
                    ? `${share >= elapsed ? "On pace" : "Behind pace"}: the line marks ${elapsed}% of the campaign's time gone.${left !== null ? ` ${left} ${left === 1 ? "day" : "days"} left.` : ""}`
                    : g.ends_on
                      ? `Ends ${formatDate(g.ends_on)}`
                      : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/**
 * Renders the shown cards in the organization's order. Two half-width cards in a row sit
 * side by side on a wide screen; everything else takes the full width.
 */
export function CardRows({ view, layout, cards }: { view: DashboardView; layout: LayoutItem[]; cards: Record<string, React.ReactNode> }) {
  // A card with nothing to show (no campaign goals yet) is left out of the pairing too.
  const present = layout.filter((l) => cards[l.id] != null && cards[l.id] !== false);
  return layoutRows(view, present).map((row) =>
    row.length === 2 ? (
      <div key={row.join("+")} className="grid gap-3 lg:grid-cols-2">
        <div className="min-w-0">{cards[row[0]!]}</div>
        <div className="min-w-0">{cards[row[1]!]}</div>
      </div>
    ) : (
      <div key={row[0]} className="min-w-0">
        {cards[row[0]!]}
      </div>
    ),
  );
}
