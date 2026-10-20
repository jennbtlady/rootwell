import { describe, expect, it } from "vitest";
import { DEFAULT_STANDARDS, giftEntryStandards, requiredGiftFields, validateGift } from "../src";

const FUND = "11111111-1111-4111-8111-111111111111";
const DONOR = "22222222-2222-4222-8222-222222222222";
const base = { constituentId: DONOR, amount: "25", giftDate: "2026-03-14", fundId: FUND, paymentMethod: "cash" };

describe("validateGift", () => {
  it("accepts a plain cash gift and computes the deductible amount", () => {
    const r = validateGift(DEFAULT_STANDARDS, base);
    expect(r.issues).toEqual([]);
    expect(r.gift?.amount).toBe("25.00");
    expect(r.gift?.deductibleAmount).toBe("25.00");
  });

  it("requires a check number for checks by default", () => {
    const r = validateGift(DEFAULT_STANDARDS, { ...base, paymentMethod: "check" });
    expect(r.gift).toBeNull();
    expect(r.issues).toEqual([{ path: "checkNumber", message: "Enter the check number" }]);
  });

  it("fills the org's default fund and enforces its required fields with plain messages", () => {
    const standards = giftEntryStandards.parse({ defaultFundId: FUND, requiredFields: ["campaignId"] });
    const r = validateGift(standards, { ...base, fundId: null });
    expect(r.issues).toEqual([{ path: "campaignId", message: "Campaign is required here" }]);
    const ok = validateGift(standards, { ...base, fundId: null, campaignId: "33333333-3333-4333-8333-333333333333" });
    expect(ok.gift?.fundId).toBe(FUND);
    expect(requiredGiftFields(standards).has("campaignId")).toBe(true);
  });

  it("rejects bad money and dates before the standards run", () => {
    const r = validateGift(DEFAULT_STANDARDS, { ...base, amount: "-5", giftDate: "March 14" });
    expect(r.issues.map((i) => i.path).sort()).toEqual(["amount", "giftDate"]);
  });

  it("handles in-kind gifts: needs a fair market value and deducts it", () => {
    const missing = validateGift(DEFAULT_STANDARDS, { ...base, giftType: "in_kind", amount: "500" });
    expect(missing.issues[0]?.path).toBe("fairMarketValue");
    const ok = validateGift(DEFAULT_STANDARDS, { ...base, giftType: "in_kind", amount: "500", fairMarketValue: "120" });
    expect(ok.gift?.deductibleAmount).toBe("380.00");
    expect(ok.gift?.paymentMethod).toBe("in_kind");
  });

  it("never lets the deductible amount exceed the gift", () => {
    const r = validateGift(DEFAULT_STANDARDS, { ...base, deductibleAmount: "30" });
    expect(r.issues[0]?.path).toBe("deductibleAmount");
  });
});

describe("constituent and money schemas", () => {
  it("normalizes money strings", async () => {
    const { money, constituentInput } = await import("../src");
    expect(money.parse("$1,250.5")).toBe("1250.50");
    expect(money.parse(12)).toBe("12.00");
    const person = constituentInput.safeParse({ type: "person" });
    expect(person.success).toBe(false);
    const org = constituentInput.safeParse({ type: "organization", orgName: "Pantry Partners" });
    expect(org.success).toBe(true);
    const twoPrimary = constituentInput.safeParse({ lastName: "Rivera", emails: [{ email: "a@b.co", isPrimary: true }, { email: "c@d.co", isPrimary: true }] });
    expect(twoPrimary.success).toBe(false);
  });
});
