import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseFile } from "../src/components/imports/parse-file";

function xlsxFile(rows: (string | number)[][], name = "donors.xlsx"): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Donors");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([buf], name);
}

describe("parseFile", () => {
  it("reads an Excel workbook, keeps text, drops blank rows, and names blank headers", async () => {
    const f = xlsxFile([["First Name", "Last Name", "", "Amount"], ["Dana", "Rivera", "x", 100], [], ["Tom", "Okafor", "", 25.5]]);
    const p = await parseFile(f);
    expect(p.headers).toEqual(["First Name", "Last Name", "Column 3", "Amount"]);
    expect(p.rows).toEqual([["Dana", "Rivera", "x", "100"], ["Tom", "Okafor", "", "25.5"]]);
  });

  it("reads CSV with a byte order mark, quotes and duplicate headers", async () => {
    const csv = '﻿Name,Email,Email\n"Rivera, Dana",dana@example.org,other@example.org\n\n';
    const p = await parseFile(new File([csv], "donors.csv", { type: "text/csv" }));
    expect(p.headers).toEqual(["Name", "Email", "Email (2)"]);
    expect(p.rows).toEqual([["Rivera, Dana", "dana@example.org", "other@example.org"]]);
  });

  it("refuses other file types and empty files with a plain message", async () => {
    await expect(parseFile(new File(["x"], "notes.pdf"))).rejects.toThrow("Choose a .csv or .xlsx file.");
    await expect(parseFile(new File(["Name\n"], "empty.csv"))).rejects.toThrow("no rows");
  });
});
