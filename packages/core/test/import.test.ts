import { describe, expect, it } from "vitest";
import { mapRow, parseAmount, parseDate, parsePaymentMethod, personKey, splitName, suggestMapping, STARTER_MAPPINGS } from "../src";

const TODAY = new Date("2026-10-20T12:00:00Z");

describe("parseDate", () => {
  it.each([
    ["2026-03-14", "2026-03-14"],
    ["2026-03-14 10:22:00", "2026-03-14"],
    ["3/14/2026", "2026-03-14"],
    ["03/14/26", "2026-03-14"],
    ["3-14-2026", "2026-03-14"],
    ["14/3/2026", "2026-03-14"],
    ["March 14, 2026", "2026-03-14"],
    ["Mar. 14 2026", "2026-03-14"],
    ["14-Mar-2026", "2026-03-14"],
    ["46095", "2026-03-14"],
  ])("reads %s", (input, expected) => {
    expect(parseDate(input, TODAY)).toEqual({ ok: true, value: expected });
  });
  it("refuses nonsense, impossible days and the future", () => {
    expect(parseDate("soon", TODAY).ok).toBe(false);
    expect(parseDate("2/30/2026", TODAY).ok).toBe(false);
    expect(parseDate("2027-01-01", TODAY).ok).toBe(false);
  });
});

describe("parseAmount", () => {
  it("cleans currency formatting", () => {
    expect(parseAmount("$1,250")).toEqual({ ok: true, value: "1250.00" });
    expect(parseAmount(" 25.5 ")).toEqual({ ok: true, value: "25.50" });
    expect(parseAmount("USD 100")).toEqual({ ok: true, value: "100.00" });
  });
  it("refuses refunds, zero and words", () => {
    expect(parseAmount("(25.00)").ok).toBe(false);
    expect(parseAmount("-25").ok).toBe(false);
    expect(parseAmount("0").ok).toBe(false);
    expect(parseAmount("twenty").ok).toBe(false);
  });
});

describe("names and methods", () => {
  it("splits names both ways", () => {
    expect(splitName("Rivera, Dana")).toMatchObject({ first: "Dana", last: "Rivera" });
    expect(splitName("Dr. Dana M. Rivera Jr.")).toEqual({ prefix: "Dr.", first: "Dana M.", last: "Rivera", suffix: "Jr." });
  });
  it("maps payment methods", () => {
    expect(parsePaymentMethod("VISA").value).toBe("card");
    expect(parsePaymentMethod("Chk").value).toBe("check");
    expect(parsePaymentMethod("Venmo").value).toBe("other");
    expect(parsePaymentMethod("barter").warning).toMatch(/Other/);
  });
});

describe("suggestMapping", () => {
  it("recognizes each starter export from its headers", () => {
    for (const s of STARTER_MAPPINGS.filter((x) => x.id !== "generic")) {
      const { mapping, starter } = suggestMapping(Object.keys(s.headers), "constituents_gifts");
      expect(starter, s.name).toBe(s.id);
      expect(Object.keys(mapping).length, s.name).toBeGreaterThanOrEqual(Object.keys(s.headers).length - 1);
    }
  });
  it("falls back to synonyms for an unknown file and never uses a gift field for constituents only", () => {
    const { mapping } = suggestMapping(["Donor Name", "E-mail Address", "Zip Code", "Donation Amount", "Date Received"], "constituents_gifts");
    expect(mapping).toMatchObject({ full_name: "Donor Name", email: "E-mail Address", postal_code: "Zip Code", amount: "Donation Amount", gift_date: "Date Received" });
    expect(suggestMapping(["Amount", "Name"], "constituents").mapping.amount).toBeUndefined();
  });
});

describe("mapRow", () => {
  const headers = ["Name", "Email", "Zip", "Amount", "Date", "Fund", "Method"];
  const mapping = { full_name: "Name", email: "Email", postal_code: "Zip", amount: "Amount", gift_date: "Date", fund: "Fund", payment_method: "Method" } as const;

  it("maps a good row and keys it by email", () => {
    const r = mapRow(["Rivera, Dana", "Dana@Example.org", "62701", "$100", "3/14/2026", "General", "check"], headers, mapping, "constituents_gifts", TODAY);
    expect(r.errors).toEqual([]);
    expect(r.mapped?.person).toMatchObject({ first_name: "Dana", last_name: "Rivera", email: "dana@example.org" });
    expect(r.mapped?.gift).toMatchObject({ amount: "100.00", gift_date: "2026-03-14", fund: "General", payment_method: "check" });
    expect(r.personKey).toBe("email:dana@example.org");
  });

  it("collects every error on a bad row and keeps the field values for fixing", () => {
    const r = mapRow(["", "not-an-email", "", "(5)", "someday", "", ""], headers, mapping, "constituents_gifts", TODAY);
    expect(r.mapped).toBeNull();
    expect(r.errors.map((e) => e.field).sort()).toEqual(["amount", "email", "gift_date", "last_name"]);
    expect(r.fields.email).toBe("not-an-email");
  });

  it("treats a row with no gift columns as a constituent only", () => {
    const r = mapRow(["Tom Okafor", "", "62704", "", "", "", ""], headers, mapping, "constituents_gifts", TODAY);
    expect(r.errors).toEqual([]);
    expect(r.mapped?.gift).toBeNull();
    expect(r.personKey).toBe("name:tom okafor|62704");
  });

  it("keys by legacy id first", () => {
    expect(personKey({ legacy_id: "A-17", email: "x@y.org", first_name: null, last_name: null, org_name: null, postal_code: null })).toBe("id:a-17");
  });
});
