import { sql } from "drizzle-orm";
import type { ReportColumn, ReportId, ReportParams, ReportResult } from "../reports";
import type { Tx } from "./types";

/**
 * Posted money in: gifts plus refund entries (fundraising Phase 2). Refund entries are
 * negative, so sums net out on their own. Counts of gifts and donors leave refunds out
 * (`isGift`), so a refund is never "a gift".
 */
const counted = sql`g.posted_at is not null and g.gift_type not in ('soft_credit', 'pledge')`;
const isGift = sql`g.gift_type <> 'refund'`;
const email = sql`(select e.email from constituent_emails e where e.constituent_id = c.id order by e.is_primary desc limit 1)`;
const phone = sql`(select p.phone from constituent_phones p where p.constituent_id = c.id order by p.is_primary desc limit 1)`;

// For a mailing: separate name parts, the primary address, and whether the person asked not
// to be mailed. Marcus could not use the old download for a mail merge.
const mailing = sql`c.first_name, c.last_name, c.org_name, case when c.do_not_mail then 'Yes' else '' end as do_not_mail, ad.line1, ad.line2, ad.city, ad.state, ad.postal_code`;
const mailingJoin = sql`left join lateral (select a.line1, a.line2, a.city, a.state, a.postal_code from constituent_addresses a where a.constituent_id = c.id order by a.is_primary desc limit 1) ad on true`;
const MAILING_COLUMNS: ReportColumn[] = [
  { key: "first_name", label: "First name", fileOnly: true },
  { key: "last_name", label: "Last name", fileOnly: true },
  { key: "org_name", label: "Organization", fileOnly: true },
  { key: "line1", label: "Address line 1", fileOnly: true },
  { key: "line2", label: "Address line 2", fileOnly: true },
  { key: "city", label: "City", fileOnly: true },
  { key: "state", label: "State", fileOnly: true },
  { key: "postal_code", label: "ZIP code", fileOnly: true },
  { key: "do_not_mail", label: "Do not mail", fileOnly: true },
];

async function fy(tx: Tx, orgId: string): Promise<string> {
  const r = await tx.execute(sql`select app.fiscal_year_start(current_date, fiscal_year_start_month)::text as s from organizations where id = ${orgId}`);
  return (r[0] as { s: string }).s;
}

/** Runs one saved report. Every query is scoped by RLS and an explicit org filter. */
export async function runReport(tx: Tx, orgId: string, id: ReportId, p: ReportParams): Promise<ReportResult> {
  const today = new Date().toISOString().slice(0, 10);
  // Dated reports start at the beginning of the organization's fiscal year, the same period
  // the dashboards and board link use, so a download matches what the board sees.
  const from = p.from ?? (await fy(tx, orgId));
  const to = p.to ?? today;
  switch (id) {
    case "lybunt":
    case "sybunt": {
      const start = await fy(tx, orgId);
      const window = id === "lybunt"
        ? sql`having sum(g.amount) filter (where g.gift_date >= (${start}::date - interval '1 year') and g.gift_date < ${start}::date) > 0`
        : sql`having sum(g.amount) filter (where g.gift_date < (${start}::date - interval '1 year')) > 0
                and coalesce(sum(g.amount) filter (where g.gift_date >= (${start}::date - interval '1 year') and g.gift_date < ${start}::date), 0) = 0`;
      const rows = await tx.execute(sql`
        select c.id, c.sort_name as name, ${email} as email, ${phone} as phone, ${mailing},
               coalesce(sum(g.amount) filter (where g.gift_date >= (${start}::date - interval '1 year') and g.gift_date < ${start}::date), 0) as last_year,
               max(g.gift_date) filter (where ${isGift}) as last_gift, sum(g.amount) as lifetime
          from constituents c join gifts g on g.constituent_id = c.id and ${counted} ${mailingJoin}
         where c.org_id = ${orgId} and not c.deceased
           -- Someone whose gift this year is still in an open batch has given; leave them off.
           and not exists (select 1 from gifts t where t.constituent_id = c.id and t.gift_type not in ('soft_credit', 'pledge', 'refund') and t.gift_date >= ${start}::date)
         group by c.id, ad.line1, ad.line2, ad.city, ad.state, ad.postal_code ${window}
         order by ${id === "lybunt" ? sql`last_year desc` : sql`lifetime desc`}`);
      return {
        columns: [
          { key: "name", label: "Name", kind: "link" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
          ...(id === "lybunt" ? [{ key: "last_year", label: "Last fiscal year", kind: "money" as const }] : []),
          { key: "last_gift", label: "Last gift", kind: "date" }, { key: "lifetime", label: "Lifetime", kind: "money" },
          ...MAILING_COLUMNS,
        ],
        rows: rows as Record<string, unknown>[],
      };
    }
    case "lapsed": {
      const rows = await tx.execute(sql`
        select c.id, c.sort_name as name, ${email} as email, ${phone} as phone, ${mailing}, max(g.gift_date) filter (where ${isGift}) as last_gift,
               (array_agg(g.amount order by g.gift_date desc) filter (where ${isGift}))[1] as last_amount, sum(g.amount) as lifetime
          from constituents c join gifts g on g.constituent_id = c.id and ${counted} ${mailingJoin}
         where c.org_id = ${orgId} and not c.deceased
         group by c.id, ad.line1, ad.line2, ad.city, ad.state, ad.postal_code
        having max(g.gift_date) filter (where ${isGift}) <= (current_date - interval '13 months')::date and max(g.gift_date) filter (where ${isGift}) > (current_date - interval '15 months')::date
         order by lifetime desc`);
      return {
        columns: [{ key: "name", label: "Name", kind: "link" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "last_gift", label: "Last gift", kind: "date" }, { key: "last_amount", label: "Last amount", kind: "money" }, { key: "lifetime", label: "Lifetime", kind: "money" }, ...MAILING_COLUMNS],
        rows: rows as Record<string, unknown>[],
      };
    }
    case "gifts_by_date": {
      const rows = await tx.execute(sql`
        select c.id, c.sort_name as name, g.gift_date, g.amount, f.name as fund, ca.name as campaign,
               case when g.gift_type = 'refund' then 'refund' else g.payment_method::text end as payment_method, g.check_number, g.deductible_amount,
               case when g.gift_type = 'refund' then '' when g.acknowledged_at is null then 'No' else 'Yes' end as thanked, g.gift_type
          from gifts g join constituents c on c.id = g.constituent_id left join funds f on f.id = g.fund_id left join campaigns ca on ca.id = g.campaign_id
         where g.org_id = ${orgId} and ${counted} and g.gift_date between ${from}::date and ${to}::date
         order by g.gift_date, c.sort_name`);
      const total = rows.reduce((s, r) => s + Number((r as { amount: string }).amount), 0);
      const giftCount = rows.filter((r) => (r as { gift_type: string }).gift_type !== "refund").length;
      const refundCount = rows.length - giftCount;
      return {
        columns: [{ key: "gift_date", label: "Date", kind: "date" }, { key: "name", label: "Donor", kind: "link" }, { key: "amount", label: "Amount", kind: "money" }, { key: "fund", label: "Fund" }, { key: "campaign", label: "Campaign" }, { key: "payment_method", label: "Method" }, { key: "check_number", label: "Check" }, { key: "deductible_amount", label: "Deductible", kind: "money" }, { key: "thanked", label: "Thanked" }],
        rows: rows as Record<string, unknown>[],
        totals: { amount: total.toFixed(2), gift_date: refundCount ? `${giftCount} gifts, ${refundCount} refunds` : `${giftCount} gifts` },
        range: { from, to },
      };
    }
    case "gifts_by_fund": {
      const rows = await tx.execute(sql`
        select coalesce(f.name, 'No fund') as fund, f.code, (count(*) filter (where ${isGift}))::int as gifts, (count(distinct g.constituent_id) filter (where ${isGift}))::int as donors, sum(g.amount) as total
          from gifts g left join funds f on f.id = g.fund_id
         where g.org_id = ${orgId} and ${counted} and g.gift_date between ${from}::date and ${to}::date
         group by f.name, f.code order by total desc`);
      const total = rows.reduce((s, r) => s + Number((r as { total: string }).total), 0);
      const gifts = rows.reduce((s, r) => s + Number((r as { gifts: number }).gifts), 0);
      // A donor who gave to two funds counts once in the total row.
      const d = await tx.execute(sql`
        select count(distinct g.constituent_id)::int as n from gifts g
         where g.org_id = ${orgId} and ${counted} and ${isGift} and g.gift_date between ${from}::date and ${to}::date`);
      return {
        columns: [{ key: "fund", label: "Fund" }, { key: "code", label: "Code" }, { key: "gifts", label: "Gifts", kind: "number" }, { key: "donors", label: "Donors", kind: "number" }, { key: "total", label: "Total", kind: "money" }],
        rows: rows as Record<string, unknown>[],
        totals: { fund: "All funds", gifts, donors: (d[0] as { n: number }).n, total: total.toFixed(2) },
        range: { from, to },
      };
    }
    case "donors_by_campaign": {
      if (!p.campaignId) return { columns: [], rows: [] };
      const rows = await tx.execute(sql`
        select c.id, c.sort_name as name, ${email} as email, (count(*) filter (where ${isGift}))::int as gifts, sum(g.amount) as total, max(g.gift_date) filter (where ${isGift}) as last_gift
          from gifts g join constituents c on c.id = g.constituent_id
         where g.org_id = ${orgId} and ${counted} and g.campaign_id = ${p.campaignId}
         group by c.id order by total desc`);
      const total = rows.reduce((s, r) => s + Number((r as { total: string }).total), 0);
      return {
        columns: [{ key: "name", label: "Donor", kind: "link" }, { key: "email", label: "Email" }, { key: "gifts", label: "Gifts", kind: "number" }, { key: "total", label: "Total", kind: "money" }, { key: "last_gift", label: "Last gift", kind: "date" }],
        rows: rows as Record<string, unknown>[],
        totals: { name: `${rows.length} donors`, total: total.toFixed(2) },
      };
    }
    case "unacknowledged": {
      const rows = await tx.execute(sql`
        select c.id, c.sort_name as name, ${email} as email, g.gift_date, g.amount, f.name as fund, (current_date - g.gift_date) as days_waiting
          from gifts g join constituents c on c.id = g.constituent_id left join funds f on f.id = g.fund_id
         where g.org_id = ${orgId} and ${counted} and ${isGift} and g.acknowledged_at is null
         order by g.gift_date`);
      return {
        columns: [{ key: "gift_date", label: "Date", kind: "date" }, { key: "name", label: "Donor", kind: "link" }, { key: "email", label: "Email" }, { key: "amount", label: "Amount", kind: "money" }, { key: "fund", label: "Fund" }, { key: "days_waiting", label: "Days waiting", kind: "number" }],
        rows: rows as Record<string, unknown>[],
      };
    }
  }
}
