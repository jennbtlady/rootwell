"use client";

import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { formatMoney } from "@/lib/format";

/**
 * The dashboard's charts, on Recharts. Colors come from the design tokens
 * (data-visualization-1 is "this year", -2 is "last year"), so overrides.css stays the one
 * place to change them. Every chart has a sentence for screen readers and a table nearby,
 * so nothing depends on seeing the chart. Recharts' default animation ("auto") is off
 * during the server render and for people who ask for reduced motion.
 */
const THIS_YEAR = "var(--paste-color-data-visualization-1)";
const LAST_YEAR = "var(--paste-color-data-visualization-2)";
const GRID = "var(--paste-color-border-weaker)";
const INK = "var(--paste-color-text-weak)";
const tick = { fill: INK, fontSize: 12 };

const shortMoney = (v: number) => (v >= 1000 ? `$${Math.round(v / 100) / 10}k` : `$${Math.round(v)}`);

/** Tooltip in the app's own style: values in text ink, a small colored key beside each. */
function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-30 border border-border-weaker bg-background-weakest px-3 py-2 text-30 leading-5 shadow-elevation-10">
      <div className="font-semibold">{label}</div>
      {payload
        .filter((p) => p.value != null)
        .map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-2 tabular-nums">
            <span className="inline-block size-2.5 rounded-10" style={{ background: p.color }} aria-hidden="true" />
            <span className="text-text-weak">{p.name}</span>
            <span className="ml-auto pl-3 font-semibold">{formatMoney(Number(p.value))}</span>
          </div>
        ))}
    </div>
  );
}

/** Running total this fiscal year against last year: the "are we on track" picture. */
export function PacingChart({ data, summary }: { data: { label: string; thisYear: number | null; lastYear: number }[]; summary: string }) {
  const last = [...data].reverse().find((d) => d.thisYear != null);
  return (
    <figure className="m-0">
      <div className="h-52 w-full sm:h-60" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
            <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={shortMoney} />
            <Tooltip content={ChartTooltip} cursor={{ stroke: INK, strokeWidth: 1, strokeDasharray: "3 3" }} />
            <Line name="Last year" dataKey="lastYear" stroke={LAST_YEAR} strokeWidth={2} strokeDasharray="6 4" dot={false} />
            <Area
              name="This year"
              dataKey="thisYear"
              stroke={THIS_YEAR}
              strokeWidth={2.5}
              fill={THIS_YEAR}
              fillOpacity={0.1}
              connectNulls={false}
             
              dot={(p: { cx?: number; cy?: number; index?: number }) =>
                last && data[p.index ?? -1] === last ? <circle key="end" cx={p.cx} cy={p.cy} r={5} fill={THIS_YEAR} stroke="var(--paste-color-background-weakest)" strokeWidth={2} /> : <g key={`d${p.index}`} />
              }
              activeDot={{ r: 5, stroke: "var(--paste-color-background-weakest)", strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-30 text-text-weak" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-pill" style={{ background: THIS_YEAR }} /> This fiscal year
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: LAST_YEAR }} /> Last fiscal year
        </span>
      </figcaption>
    </figure>
  );
}

/** Dollars each month, this year beside last year. */
export function MonthBars({ data, summary }: { data: { label: string; current: number; prior: number }[]; summary: string }) {
  return (
    <div className="h-56 w-full" role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} accessibilityLayer={false}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={shortMoney} />
          <Tooltip content={ChartTooltip} cursor={{ fill: "var(--paste-color-background-weak)" }} />
          <Bar name="Last year" dataKey="prior" fill={LAST_YEAR} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar name="This year" dataKey="current" fill={THIS_YEAR} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
