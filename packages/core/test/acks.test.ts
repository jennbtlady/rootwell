import { describe, expect, it } from "vitest";
import { DEFAULT_LETTER, renderTemplate, substantiation, toCsv, unknownMergeFields } from "../src";

describe("substantiation", () => {
  it("says nothing was received for a plain gift", () => {
    expect(substantiation({ amount: "300.00", deductibleAmount: "300.00", giftType: "one_time", giftDate: "2026-01-01", notes: null }, "Org")).toBe("No goods or services were provided in exchange for this contribution.");
  });
  it("states the value received for a gala ticket", () => {
    expect(substantiation({ amount: "150.00", deductibleAmount: "90.00", giftType: "one_time", giftDate: "2026-01-01", notes: null }, "Org")).toBe(
      "In exchange for your contribution of $150.00, you received goods or services with an estimated fair market value of $60.00. The amount of your contribution that may be tax deductible is $90.00.",
    );
  });
  it("describes and does not value property", () => {
    const t = substantiation({ amount: "500.00", deductibleAmount: "380.00", giftType: "in_kind", giftDate: "2026-01-01", notes: "Two pallets of canned food" }, "Riverside Food Pantry");
    expect(t).toContain("described as: Two pallets of canned food");
    expect(t).not.toContain("$");
  });
});

describe("templates", () => {
  it("fills merge fields and leaves unknown ones visible", () => {
    expect(renderTemplate("Dear {{salutation}}, {{ gift_amount }} {{bogus}}", { salutation: "Dana", gift_amount: "$100.00" })).toBe("Dear Dana, $100.00 {{bogus}}");
    expect(unknownMergeFields(DEFAULT_LETTER.body)).toEqual([]);
    expect(unknownMergeFields("{{salutaton}}")).toEqual(["salutaton"]);
  });
});

describe("toCsv", () => {
  it("quotes, neutralizes formulas, keeps numbers", () => {
    const csv = toCsv([{ key: "a", label: "Name" }, { key: "b", label: "Amount" }], [{ a: '=HYPERLINK("x")', b: "-25.00" }, { a: "Rivera, Dana", b: 100 }]);
    expect(csv).toBe('﻿Name,Amount\r\n"\'=HYPERLINK(""x"")",-25.00\r\n"Rivera, Dana",100\r\n');
  });
});
