/**
 * CSV for spreadsheets. Cells that start with = + - @ or a tab are prefixed with an
 * apostrophe so a spreadsheet does not run them as formulas (CSV injection).
 */
export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.label)).join(","), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
