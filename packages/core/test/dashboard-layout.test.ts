import { describe, expect, it } from "vitest";
import { dashboardLayoutInput, layoutRows, resolveLayout } from "../src";

describe("dashboard layouts", () => {
  it("nothing saved means every card, in the default order", () => {
    expect(resolveLayout("staff", undefined).map((c) => c.id)).toEqual(["todo", "this_year", "reach_out", "campaign_goals", "recent_gifts"]);
    expect(resolveLayout("staff", undefined).every((c) => c.shown)).toBe(true);
  });
  it("drops cards that no longer exist and adds new ones at the end, shown", () => {
    const saved = [{ id: "recent_gifts", shown: false }, { id: "gone", shown: true }, { id: "todo", shown: true }, { id: "todo", shown: false }];
    expect(resolveLayout("staff", saved)).toEqual([
      { id: "recent_gifts", shown: false },
      { id: "todo", shown: true },
      { id: "this_year", shown: true },
      { id: "reach_out", shown: true },
      { id: "campaign_goals", shown: true },
    ]);
    expect(resolveLayout("board", "not a list").length).toBe(6);
  });
  it("puts two half cards side by side, and a lone half card full width, keeping the chosen order", () => {
    const layout = resolveLayout("board", undefined);
    expect(layoutRows("board", layout)).toEqual([["headline"], ["key_numbers"], ["campaign_goals"], ["by_month"], ["by_fund", "top_gifts"]]);
    const split = ["by_fund", "by_month", "top_gifts", "headline", "key_numbers", "campaign_goals"].map((id) => ({ id, shown: id !== "headline" }));
    expect(layoutRows("board", split)).toEqual([["by_fund"], ["by_month"], ["top_gifts"], ["key_numbers"], ["campaign_goals"]]);
  });
  it("accepts a save only with every card once and at least one shown", () => {
    const all = resolveLayout("staff", undefined);
    expect(dashboardLayoutInput.safeParse({ view: "staff", cards: all }).success).toBe(true);
    expect(dashboardLayoutInput.safeParse({ view: "staff", cards: all.slice(1) }).success).toBe(false);
    expect(dashboardLayoutInput.safeParse({ view: "staff", cards: all.map((c) => ({ ...c, shown: false })) }).success).toBe(false);
    expect(dashboardLayoutInput.safeParse({ view: "board", cards: all }).success).toBe(false);
  });
});
