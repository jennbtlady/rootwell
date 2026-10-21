const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export function formatMoney(value: string | number | null | undefined): string {
  if (value == null || value === "") return money.format(0);
  return money.format(Number(value));
}

/** For plain dates (YYYY-MM-DD). Rendered in UTC so the day never shifts. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? value : dateFmt.format(d);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  // Joined by hand: Node and browsers disagree on the word between date and time ("at" or a
  // comma), which made server and browser render different text.
  return Number.isNaN(d.getTime()) ? value : `${dayFmt.format(d)} at ${timeFmt.format(d)}`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
