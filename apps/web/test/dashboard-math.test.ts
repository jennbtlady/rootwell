import { describe, expect, it } from "vitest";
import { daysLeft, monthIndex, pacing, timeElapsed } from "../src/lib/dashboard-math";

describe("dashboard math", () => {
  it("counts months from the fiscal year start", () => {
    expect(monthIndex("2026-07-01", "2026-10-21")).toBe(3);
    expect(monthIndex("2026-01-01", "2026-01-05")).toBe(0);
    expect(monthIndex("2025-07-01", "2026-06-30")).toBe(11);
  });
  it("runs both totals, and stops this year's line at the current month", () => {
    const rows = ["Jul", "Aug", "Sep", "Oct"].map((label, month_index) => ({ label, month_index, current: 100, prior: "50" }));
    expect(pacing(rows, "2026-07-01", "2026-08-15")).toEqual([
      { label: "Jul", thisYear: 100, lastYear: 50 },
      { label: "Aug", thisYear: 200, lastYear: 100 },
      { label: "Sep", thisYear: null, lastYear: 150 },
      { label: "Oct", thisYear: null, lastYear: 200 },
    ]);
  });
  it("gives a campaign's share of time gone, and days left", () => {
    expect(timeElapsed("2026-10-01", "2026-10-31", "2026-10-16")).toBe(50);
    expect(timeElapsed("2026-10-01", "2026-10-31", "2026-12-01")).toBe(100);
    expect(timeElapsed(null, "2026-10-31", "2026-10-16")).toBeNull();
    expect(daysLeft("2026-10-31", "2026-10-21")).toBe(10);
    expect(daysLeft("2026-10-01", "2026-10-21")).toBe(0);
  });
});
