import { z } from "zod";

/**
 * The cards on each dashboard, and which ones show in what order. One layout per
 * organization for each view (Jenn, 2026-10-20). Owners and admins choose; everyone in the
 * organization, and board links, see the result.
 *
 * A card is "half" when it can sit beside another half card on a wide screen.
 */
export type DashboardView = "staff" | "board";
export type CardDef = { id: string; label: string; description: string; width: "full" | "half" };

export const DASHBOARD_CARDS: Record<DashboardView, CardDef[]> = {
  staff: [
    { id: "todo", label: "To do", description: "Gifts to thank, batches to post, duplicates to check.", width: "full" },
    { id: "this_year", label: "How this fiscal year is going", description: "Dollars, donors and retention, against last year, with small trend lines.", width: "full" },
    { id: "pacing", label: "Raised so far, against last year", description: "The running total this fiscal year, with last year's line to beat.", width: "full" },
    { id: "reach_out", label: "Who to reach out to", description: "Gave last year but not yet this year, lapsed donors, and last year's top donors.", width: "half" },
    { id: "campaign_goals", label: "Campaign goals", description: "Progress toward each active campaign goal.", width: "half" },
    { id: "recent_gifts", label: "Recent gifts", description: "The latest gifts entered, posted or not.", width: "full" },
  ],
  board: [
    { id: "headline", label: "Summary sentence", description: "Are we on track, in one sentence.", width: "full" },
    { id: "pacing", label: "Raised so far, against last year", description: "The running total this fiscal year, with last year's line to beat.", width: "full" },
    { id: "key_numbers", label: "Key numbers", description: "Dollars, donors, retention, and new donors this fiscal year, with small trend lines.", width: "full" },
    { id: "campaign_goals", label: "Campaign goals", description: "Progress toward each active campaign goal.", width: "full" },
    { id: "by_fund", label: "By fund", description: "Where this fiscal year's gifts went.", width: "half" },
    { id: "gift_bands", label: "Gifts by size", description: "How much of the total came from large, middle and small gifts.", width: "half" },
    { id: "top_gifts", label: "Largest gifts", description: "The five largest gifts this fiscal year. Names follow the board sharing setting.", width: "half" },
    { id: "by_month", label: "Dollars by month", description: "This fiscal year against last, month by month.", width: "full" },
  ],
};

export type LayoutItem = { id: string; shown: boolean };

export const DASHBOARD_VIEWS = ["staff", "board"] as const;

/**
 * The saved layout made safe to render: unknown cards are dropped, and cards added to the
 * app since it was saved appear at the end, shown. Nothing saved means the default order.
 */
export function resolveLayout(view: DashboardView, saved: unknown): LayoutItem[] {
  const cards = DASHBOARD_CARDS[view];
  const known = new Set(cards.map((c) => c.id));
  const parsed = z.array(z.object({ id: z.string(), shown: z.boolean() })).safeParse(saved);
  const seen = new Set<string>();
  const out: LayoutItem[] = [];
  for (const item of parsed.success ? parsed.data : []) {
    if (known.has(item.id) && !seen.has(item.id)) {
      seen.add(item.id);
      out.push({ id: item.id, shown: item.shown });
    }
  }
  for (const c of cards) if (!seen.has(c.id)) out.push({ id: c.id, shown: true });
  return out;
}

/**
 * The shown cards grouped into rows: two half cards side by side become one row, and a
 * half card with no half neighbour takes the full width. DOM order always follows the
 * chosen order, so screen readers and keyboards meet the cards as the person arranged them.
 */
export function layoutRows(view: DashboardView, layout: LayoutItem[]): string[][] {
  const width = new Map(DASHBOARD_CARDS[view].map((c) => [c.id, c.width]));
  const shown = layout.filter((l) => l.shown).map((l) => l.id);
  const rows: string[][] = [];
  for (let i = 0; i < shown.length; i++) {
    const id = shown[i]!;
    const next = shown[i + 1];
    if (width.get(id) === "half" && next && width.get(next) === "half") {
      rows.push([id, next]);
      i++;
    } else rows.push([id]);
  }
  return rows;
}

export const dashboardLayoutInput = z
  .object({
    view: z.enum(DASHBOARD_VIEWS),
    cards: z.array(z.object({ id: z.string().max(40), shown: z.boolean() })).max(20),
  })
  .superRefine((v, ctx) => {
    const known = new Set(DASHBOARD_CARDS[v.view].map((c) => c.id));
    const ids = v.cards.map((c) => c.id);
    if (ids.some((id) => !known.has(id)) || new Set(ids).size !== ids.length || ids.length !== known.size) {
      ctx.addIssue({ code: "custom", path: ["cards"], message: "Send every card for this dashboard once" });
    }
    if (!v.cards.some((c) => c.shown)) ctx.addIssue({ code: "custom", path: ["cards"], message: "Show at least one card" });
  });
export type DashboardLayoutInput = z.infer<typeof dashboardLayoutInput>;
