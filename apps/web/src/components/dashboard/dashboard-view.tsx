import type { DashboardData } from "@maple/core/services";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, Heading } from "@/components/ui";
import { Definition } from "./definition";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
const num = (v: number | string) => Number(v);

function Delta({ now, before, money }: { now: number; before: number; money?: boolean }) {
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

function Tile({ label, value, children, definition }: { label: string; value: string; children?: React.ReactNode; definition?: string }) {
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
function Bars({ title, rows }: { title: string; rows: { name: string; total: number | string; gifts: number }[] }) {
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
function MonthChart({ rows, asOf }: { rows: DashboardData["byMonth"]; asOf: string }) {
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

const DEF = {
  donors: "People and organizations with at least one posted gift this fiscal year. Soft credits and pledges are not counted; pledge payments are.",
  dollars: "Total of posted gifts this fiscal year, compared with the same dates last year.",
  median: "Half of this year's gifts are larger than this and half are smaller. Less swayed by one big gift than the average.",
  newRepeat: "New donors gave their first gift ever this fiscal year. Repeat donors had given before.",
  overall: "Fundraising Effectiveness Project definition: donors from the earlier year who gave again in the later year, divided by donors in the earlier year. Measured over the last two completed fiscal years. Some donor tools count a donor who gives at any later time instead, which gives a higher number; the two cannot be compared.",
  firstTime: "Fundraising Effectiveness Project definition: of donors whose first gift ever was in the earlier year, the share who gave again in the later year. The national figure has been under 20% for years. Some donor tools count a donor who gives at any later time instead, which gives a higher number; the two cannot be compared.",
  repeat: "Fundraising Effectiveness Project definition: of donors in the earlier year who had also given before it, the share who gave again in the later year. Some donor tools count a donor who gives at any later time instead, which gives a higher number; the two cannot be compared.",
  lapsed: "Donors whose last gift was between 13 and 15 months ago: the window to win them back before they fall away.",
};

export function DashboardView({ data, showNames, lapsedHref }: { data: DashboardData; showNames: boolean; lapsedHref?: string }) {
  const r = data.retention;
  const rate = (x: { base: number; retained: number }) => {
    const p = pct(x.retained, x.base);
    return p === null ? "No data" : `${p}%`;
  };
  const fy = (d: string) => `FY${Number(d.slice(0, 4)) + (d.slice(5, 7) === "01" ? 0 : 1)}`;
  const period = `${fy(data.retentionPeriod.earlierStart)} to ${fy(data.retentionPeriod.laterStart)}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Dollars this year" value={formatMoney(data.dollarsYtd)} definition={DEF.dollars}>
          <Delta now={num(data.dollarsYtd)} before={num(data.dollarsPriorYtd)} money />
        </Tile>
        <Tile label="Donors this year" value={data.donorsYtd.toLocaleString()} definition={DEF.donors}>
          <Delta now={data.donorsYtd} before={data.donorsPriorYtd} />
        </Tile>
        <Tile label="Median gift" value={formatMoney(data.medianGiftYtd)} definition={DEF.median}>
          <span className="text-30 text-text-weak">
            Average {formatMoney(data.averageGiftYtd)} across {data.giftsYtd.toLocaleString()} gifts
          </span>
        </Tile>
        <Tile label="New and repeat donors" value={`${data.newDonorsYtd} / ${data.repeatDonorsYtd}`} definition={DEF.newRepeat}>
          <span className="text-30 text-text-weak">
            {data.newDonorsYtd} new, {data.repeatDonorsYtd} repeat
          </span>
        </Tile>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Donor retention" value={rate(r.overall)} definition={DEF.overall}>
          <span className="text-30 text-text-weak">
            {r.overall.retained} of {r.overall.base}, {period}
          </span>
        </Tile>
        <Tile label="First-time donor retention" value={rate(r.firstTime)} definition={DEF.firstTime}>
          <span className="text-30 text-text-weak">
            {r.firstTime.retained} of {r.firstTime.base}, {period}
          </span>
        </Tile>
        <Tile label="Repeat donor retention" value={rate(r.repeat)} definition={DEF.repeat}>
          <span className="text-30 text-text-weak">
            {r.repeat.retained} of {r.repeat.base}, {period}
          </span>
        </Tile>
      </div>

      <MonthChart rows={data.byMonth} asOf={data.asOf} />

      <div className="grid gap-3 lg:grid-cols-2">
        <Bars title="By fund this year" rows={data.byFund} />
        <Bars title="By campaign this year" rows={data.byCampaign} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <Card className="p-4 sm:p-5 print:break-inside-avoid">
          <Heading variant="heading40" as="h2">
            Top 10 gifts this year
          </Heading>
          {data.topGifts.length === 0 ? (
            <p className="text-30 text-text-weak">No gifts yet this year.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-border-weaker text-30 leading-5">
              {data.topGifts.map((g, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {showNames ? g.name : "A donor"} <span className="text-text-weak">· {formatDate(g.date)}{g.fund ? ` · ${g.fund}` : ""}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatMoney(g.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Tile label="Lapsed donors" value={data.lapsed.count.toLocaleString()} definition={DEF.lapsed}>
          <span className="text-30 text-text-weak">
            Last gift between {formatDate(data.lapsed.from)} and {formatDate(data.lapsed.to)}.
          </span>
          {lapsedHref && data.lapsed.count > 0 && (
            <a href={lapsedHref} className="mt-1 text-30 text-text-link underline underline-offset-2 print:hidden">
              See the list and export it
            </a>
          )}
        </Tile>
      </div>
    </div>
  );
}
