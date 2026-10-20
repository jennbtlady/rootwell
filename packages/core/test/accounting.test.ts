import { describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNTS, depositSummaryCsv, journalCsv, journalLines, type ExportBatch } from "../src/accounting";
import { splitName } from "../src/services/online";

const batches: ExportBatch[] = [
  {
    batchId: "b1",
    batchDate: "2026-03-14",
    description: "Stripe deposit",
    gifts: [
      { amount: "102.56", fee: "2.56", fundName: "General", incomeAccount: "4000 Contributions:General" },
      { amount: "25.00", fee: "0.85", fundName: "General", incomeAccount: "4000 Contributions:General" },
      { amount: "50.00", fee: "1.40", fundName: "Building", incomeAccount: null },
    ],
  },
  { batchId: "b2", batchDate: "2026-03-15", description: "=HYPERLINK(evil)", gifts: [{ amount: "40.00", fee: null, fundName: null, incomeAccount: null }] },
  { batchId: "b3", batchDate: "2026-03-16", description: "Empty", gifts: [] },
];

describe("QuickBooks journal", () => {
  const lines = journalLines(batches, DEFAULT_ACCOUNTS);

  it("balances every entry and skips empty batches", () => {
    const by = new Map<string, number>();
    for (const l of lines) by.set(l.journalNo, (by.get(l.journalNo) ?? 0) + l.debit - l.credit);
    expect([...by.values()]).toEqual([0, 0]);
  });

  it("debits the bank for the net, fees separately, and credits each income account gross", () => {
    const b1 = lines.filter((l) => l.journalNo === lines[0]!.journalNo);
    expect(b1.map((l) => [l.account, l.debit, l.credit])).toEqual([
      ["Checking", 17275, 0],
      ["Bank and payment fees", 481, 0],
      ["4000 Contributions:General", 0, 12756],
      ["Contributions", 0, 5000],
    ]);
  });

  it("writes US dates and defuses formula text", () => {
    const csv = journalCsv(lines);
    expect(csv).toContain("03/14/2026");
    expect(csv).toContain("'=HYPERLINK(evil)");
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });

  it("summarizes each deposit", () => {
    const rows = depositSummaryCsv(batches).replace(/^﻿/, "").trim().split("\r\n");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe("03/14/2026,Stripe deposit,3,177.56,4.81,172.75");
  });
});

describe("splitName", () => {
  it("keeps the last word as the last name", () => {
    expect(splitName("Ana María de la Cruz")).toEqual({ first: "Ana María de la", last: "Cruz" });
    expect(splitName("  Cher ")).toEqual({ first: null, last: "Cher" });
    expect(splitName(null)).toEqual({ first: null, last: null });
  });
});
