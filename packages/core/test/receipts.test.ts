import { describe, expect, it } from "vitest";
import { buildReceipt, buildTributeNotice, defaultTaxStatement, receiptSettingsInput, resolvedReceipts } from "../src/receipts";

/** Fundraising Phase 2: the receipt carries what the IRS asks for, and the tribute notice keeps the amount private. */
describe("receipts", () => {
  const org = { name: "Hallowell Animal Rescue", ein: "12-3456789" };
  const gift = { amountCents: 5000, deductibleCents: null, giftDate: "2026-11-12", designation: "Sponsoring Pippin", monthly: false, tribute: null, manageUrl: null };

  it("has the organization, amount, date, tax status and the goods or services statement", () => {
    const r = buildReceipt(org, {}, "Riley Dunn", gift);
    expect(r.subject).toBe("Thank you for your gift to Hallowell Animal Rescue");
    for (const line of [
      "Dear Riley Dunn,",
      "Amount: $50.00",
      "Date: November 12, 2026",
      "For: Sponsoring Pippin",
      "No goods or services were provided in exchange for this contribution.",
      "Hallowell Animal Rescue is a tax-exempt organization under Section 501(c)(3) of the Internal Revenue Code. Our EIN is 12-3456789.",
      "Please keep this email for your tax records.",
    ]) {
      expect(r.text).toContain(line);
    }
  });

  it("states the value received when the gift bought something, such as a ticket", () => {
    const r = buildReceipt(org, {}, null, { ...gift, amountCents: 7500, deductibleCents: 4500 });
    expect(r.text).toContain("Hello,");
    expect(r.text).toContain("estimated fair market value of $30.00");
    expect(r.text).toContain("may be tax deductible is $45.00");
  });

  it("uses the organization's own words, and adds the monthly link and tribute", () => {
    const r = buildReceipt(org, { thankYou: "Every tail wags because of you.", signature: "The team at HAR" }, "Riley Dunn", {
      ...gift,
      monthly: true,
      tribute: { kind: "memory", honoreeName: "Biscuit" },
      manageUrl: "https://rootwell.test/manage/abc",
    });
    expect(r.text).toContain("Every tail wags because of you.");
    expect(r.text).toContain("Amount: $50.00 (monthly gift)");
    expect(r.text).toContain("In memory of: Biscuit");
    expect(r.text).toContain("https://rootwell.test/manage/abc");
    expect(r.text.trim().endsWith("The team at HAR")).toBe(true);
  });

  it("fills in defaults, and receipts are on unless turned off", () => {
    expect(resolvedReceipts({}, org)).toMatchObject({ enabled: true, signature: "Hallowell Animal Rescue", replyTo: null });
    expect(resolvedReceipts({ enabled: false }, org).enabled).toBe(false);
    expect(defaultTaxStatement("Shelter", null)).not.toContain("EIN");
  });

  it("checks the reply-to address", () => {
    expect(receiptSettingsInput.safeParse({ enabled: true, replyTo: "office@example.org" }).success).toBe(true);
    expect(receiptSettingsInput.safeParse({ enabled: true, replyTo: "not an email" }).success).toBe(false);
    expect(receiptSettingsInput.safeParse({ enabled: true, replyTo: "" }).success).toBe(true);
  });

  it("tells the named person about a tribute without the amount", () => {
    const n = buildTributeNotice("Hallowell Animal Rescue", "Riley Dunn", { kind: "honor", honoreeName: "Grandma Rose", notifyName: "Jordan" });
    expect(n.subject).toBe("A gift in honor of Grandma Rose");
    expect(n.text).toContain("Dear Jordan,");
    expect(n.text).toContain("Riley Dunn made a gift to Hallowell Animal Rescue in honor of Grandma Rose");
    expect(n.text).not.toMatch(/\$|\d/);
  });
});
