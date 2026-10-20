"use client";

import Papa from "papaparse";

export type ParsedFile = { headers: string[]; rows: string[][] };

export const MAX_ROWS = 50_000;
export const MAX_COLUMNS = 200;

/**
 * Reads a CSV or Excel file in the browser. The file never leaves this computer; only
 * the rows are sent, in chunks, after the person confirms. Blank rows are dropped and
 * every cell becomes text.
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  let table: string[][];
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    if (!sheet) throw new Error("That workbook has no sheets.");
    table = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  } else if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") {
    const text = await file.text();
    const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
    if (result.errors.length && !result.data.length) throw new Error("We could not read that CSV file.");
    table = result.data;
  } else {
    throw new Error("Choose a .csv or .xlsx file.");
  }
  table = table.map((r) => r.map((c) => (c == null ? "" : String(c))));
  const headerRow = table.shift() ?? [];
  const headers = dedupeHeaders(headerRow.map((h, i) => h.trim() || `Column ${i + 1}`));
  const rows = table.filter((r) => r.some((c) => c.trim() !== "")).map((r) => headers.map((_, i) => r[i] ?? ""));
  if (!headers.length) throw new Error("The first row should be column names.");
  if (headers.length > MAX_COLUMNS) throw new Error(`That file has ${headers.length} columns. The limit is ${MAX_COLUMNS}.`);
  if (!rows.length) throw new Error("That file has column names but no rows.");
  if (rows.length > MAX_ROWS) throw new Error(`That file has ${rows.length.toLocaleString()} rows. The limit is ${MAX_ROWS.toLocaleString()}; split it into smaller files.`);
  return { headers, rows };
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });
}
