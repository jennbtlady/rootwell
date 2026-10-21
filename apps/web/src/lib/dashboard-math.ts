/**
 * Small calculations the dashboard charts share. Kept apart from the components so a
 * server page and a client chart can both use them, and so they can be unit tested.
 */
type MonthRow = { label: string; current: number | string; prior: number | string; month_index: number };

/** Months since the fiscal year started, 0 to 11, for the as-of date. */
export function monthIndex(fiscalYearStart: string, asOf: string): number {
  const [fy, fm] = fiscalYearStart.split("-").map(Number) as [number, number];
  const [ay, am] = asOf.split("-").map(Number) as [number, number];
  return Math.max(0, Math.min(11, (ay - fy) * 12 + (am - fm)));
}

/**
 * Running totals by month: this year up to the current month (later months are null, so
 * the line stops at today), and last year for the whole year as the line to beat.
 */
export function pacing(rows: MonthRow[], fiscalYearStart: string, asOf: string) {
  const now = monthIndex(fiscalYearStart, asOf);
  let thisYear = 0;
  let lastYear = 0;
  return [...rows]
    .sort((a, b) => a.month_index - b.month_index)
    .map((r) => {
      lastYear += Number(r.prior);
      if (r.month_index <= now) thisYear += Number(r.current);
      return { label: r.label, thisYear: r.month_index <= now ? thisYear : null, lastYear };
    });
}

/** Share of a campaign's dates already gone, 0 to 100, or null without both dates. */
export function timeElapsed(startsOn: string | null, endsOn: string | null, asOf: string): number | null {
  if (!startsOn || !endsOn) return null;
  const s = Date.parse(startsOn);
  const e = Date.parse(endsOn);
  const t = Date.parse(asOf);
  if (!(e > s)) return null;
  return Math.round(Math.max(0, Math.min(1, (t - s) / (e - s))) * 100);
}

/** Whole days from the as-of date to the end date, never below zero. */
export function daysLeft(endsOn: string | null, asOf: string): number | null {
  if (!endsOn) return null;
  return Math.max(0, Math.round((Date.parse(endsOn) - Date.parse(asOf)) / 86_400_000));
}
