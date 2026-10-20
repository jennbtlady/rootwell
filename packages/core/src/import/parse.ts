/** Parsers for the messy values real spreadsheets contain. Each returns a value or an error message. */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = <T>(error: string): Parsed<T> => ({ ok: false, error });

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * Dates as people type them: 2026-03-14, 3/14/2026, 3/14/26, 03-14-2026, March 14, 2026,
 * 14-Mar-2026, with or without a time, and Excel serial numbers (45730).
 * Day-first (14/3/2026) is accepted only when the first number cannot be a month.
 */
export function parseDate(input: string, today = new Date()): Parsed<string> {
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) return fail("Enter a date");
  let out: string | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/))) out = iso(+m[1]!, +m[2]!, +m[3]!);
  else if ((m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})(?: .*)?$/))) {
    let y = +m[3]!;
    if (y < 100) y += y < 50 ? 2000 : 1900;
    const a = +m[1]!, b = +m[2]!;
    out = a > 12 ? iso(y, b, a) : iso(y, a, b);
  } else if ((m = s.match(/^([A-Za-z]+)\.? (\d{1,2}),? (\d{4})(?: .*)?$/))) {
    const mo = MONTHS[m[1]!.toLowerCase()];
    out = mo ? iso(+m[3]!, mo, +m[2]!) : null;
  } else if ((m = s.match(/^(\d{1,2})[ \-]([A-Za-z]+)[ \-,]*(\d{4})$/))) {
    const mo = MONTHS[m[2]!.toLowerCase()];
    out = mo ? iso(+m[3]!, mo, +m[1]!) : null;
  } else if ((m = s.match(/^(\d{5})(?:\.\d+)?$/))) {
    const serial = +m[1]!;
    if (serial > 20000 && serial < 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      out = dt.toISOString().slice(0, 10);
    }
  }
  if (!out) return fail(`We could not read "${s}" as a date. Use a date like 2026-03-14 or 3/14/2026`);
  const tomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
  if (out > tomorrow) return fail(`${out} is in the future`);
  return ok(out);
}

/** Money: "$1,250.00", "1250", "1 250,00" is not supported. Refunds and zero are refused. */
export function parseAmount(input: string): Parsed<string> {
  const s = input.trim();
  if (!s) return fail("Enter an amount");
  if (/^\(.*\)$/.test(s) || s.startsWith("-") || s.includes("-$") || s.startsWith("$-")) return fail("Negative amounts (refunds) are not imported");
  const clean = s.replace(/^(usd|us\$)\s*/i, "").replace(/\s*(usd)$/i, "").replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(clean)) return fail(`"${s}" is not an amount`);
  const n = Math.round(Number(clean) * 100) / 100;
  if (n <= 0) return fail("Amount must be more than zero");
  if (n > 10_000_000) return fail("That amount is larger than we expect. Check the column");
  return ok(n.toFixed(2));
}

export function parseYesNo(input: string): boolean | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (["y", "yes", "true", "1", "x", "checked", "t"].includes(s)) return true;
  if (["n", "no", "false", "0", "f", "unchecked"].includes(s)) return false;
  return null;
}

export function parseEmail(input: string): Parsed<string | null> {
  const s = input.trim().toLowerCase().replace(/^mailto:/, "");
  if (!s) return ok(null);
  if (!/^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/.test(s)) return fail(`"${input.trim()}" does not look like an email`);
  return ok(s);
}

/** Returns the phone as typed when it has 7 to 15 digits, else null with a warning. */
export function parsePhone(input: string): { value: string | null; warning: string | null } {
  const s = input.trim();
  if (!s) return { value: null, warning: null };
  const digits = s.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return { value: null, warning: `Phone "${s}" was left out because it has ${digits.length} digits` };
  return { value: s, warning: null };
}

export function parsePaymentMethod(input: string): { value: string; warning: string | null } {
  const s = input.trim().toLowerCase();
  if (!s) return { value: "other", warning: null };
  if (/check|cheque|chk/.test(s)) return { value: "check", warning: null };
  if (/cash/.test(s)) return { value: "cash", warning: null };
  if (/card|credit|debit|visa|master|amex|american express|discover|stripe|square|apple pay|google pay/.test(s)) return { value: "card", warning: null };
  if (/ach|bank|eft|wire|transfer|direct debit/.test(s)) return { value: "ach", warning: null };
  if (/stock|securit|share/.test(s)) return { value: "stock", warning: null };
  if (/in.?kind|goods|item/.test(s)) return { value: "in_kind", warning: null };
  if (/paypal|venmo|zelle|cash app|online|other/.test(s)) return { value: "other", warning: null };
  return { value: "other", warning: `Payment method "${input.trim()}" was recorded as Other` };
}

/** "Rivera, Dana" or "Dana M. Rivera" or "Dr. Dana Rivera Jr." into parts. */
export function splitName(input: string): { prefix: string | null; first: string | null; last: string | null; suffix: string | null } {
  let s = input.trim().replace(/\s+/g, " ");
  const out = { prefix: null as string | null, first: null as string | null, last: null as string | null, suffix: null as string | null };
  if (!s) return out;
  const pre = s.match(/^(mr|mrs|ms|miss|mx|dr|rev|prof|hon)\.? /i);
  if (pre) {
    out.prefix = pre[0].trim();
    s = s.slice(pre[0].length);
  }
  const suf = s.match(/,? (jr|sr|ii|iii|iv|md|phd|esq)\.?$/i);
  if (suf) {
    out.suffix = suf[0].replace(/^,? /, "");
    s = s.slice(0, s.length - suf[0].length);
  }
  if (s.includes(",")) {
    const [last, first] = s.split(",", 2).map((x) => x.trim());
    out.last = last || null;
    out.first = first || null;
  } else {
    const parts = s.split(" ");
    if (parts.length === 1) out.last = parts[0]!;
    else {
      out.last = parts.pop()!;
      out.first = parts.join(" ");
    }
  }
  return out;
}

export function parseType(input: string): "person" | "household" | "organization" | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (/house|family/.test(s)) return "household";
  if (/org|company|business|corp|foundation|church|school|group/.test(s)) return "organization";
  return "person";
}
