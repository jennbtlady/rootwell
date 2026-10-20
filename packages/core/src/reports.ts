import { z } from "zod";

/** The saved report library. No custom builder in v1. */
export const REPORTS = [
  { id: "lybunt", title: "LYBUNT", description: "Gave last fiscal year, but not yet this one. Your first list to call.", params: [] },
  { id: "sybunt", title: "SYBUNT", description: "Gave in an earlier year, but not last year or this year.", params: [] },
  { id: "gifts_by_date", title: "Gifts by date", description: "Every posted gift between two dates.", params: ["from", "to"] },
  { id: "gifts_by_fund", title: "Gifts by fund", description: "Totals for each fund between two dates.", params: ["from", "to"] },
  { id: "donors_by_campaign", title: "Donors by campaign", description: "Everyone who gave to one campaign, with their totals.", params: ["campaignId"] },
  { id: "unacknowledged", title: "Unthanked gifts", description: "Posted gifts that have not been acknowledged, oldest first.", params: [] },
  { id: "lapsed", title: "Lapsed donors", description: "Last gift between 13 and 15 months ago. Reach them before they are gone.", params: [] },
] as const;

export type ReportId = (typeof REPORTS)[number]["id"];
export const REPORT_IDS = REPORTS.map((r) => r.id) as [ReportId, ...ReportId[]];

export const reportParams = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  campaignId: z.string().uuid().optional(),
});
export type ReportParams = z.infer<typeof reportParams>;

export type ReportColumn = { key: string; label: string; kind?: "money" | "date" | "number" | "text" | "link" };
export type ReportResult = { columns: ReportColumn[]; rows: Record<string, unknown>[]; totals?: Record<string, unknown> };
