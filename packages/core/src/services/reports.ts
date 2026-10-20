import { sql } from "drizzle-orm";
import type { ReportId, ReportParams, ReportResult } from "../reports";
import type { Tx } from "./types";

const counted = sql`g.posted_at is not null and g.gift_type not in ('soft_credit', 'pledge')`;
const email = sql`(select e.email from constituent_emails e where e.constituent_id = c.id order by e.is_primary desc limit 1)`;
const phone = sql`(select p.phone from constituent_phones p where p.constituent_id = c.id order by p.is_primary desc limit 1)`;

async function fy(tx: Tx, orgId: string): Promise<string> {
  const r = await tx.execute(sql`select app.fiscal_year_start(current_date, fiscal_year_start_month)::text as s from organizations where id = ${orgId}`);
  return (r[0] as { s: string }).s;
}

/** Runs one saved report. Every query is scoped by RLS and an explicit org filter. */
export async function runReport(tx: Tx, orgId: string, id: ReportId, p: ReportParams): Promise<ReportResult> {
  const today = new Date().toISOString().slice(0, 10);
  const from = p.from ?? `${today.slice(0, 4)}-01-01`;
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
        select c.id, c.sort_name as name, ${email} as email, ${phone} as phone,
               coalesce(sum(g.amount) filter (where g.gift_date >= (${start}::date - interval '1 year') and g.gift_date < ${start}::date), 0) as last_year,
               max(g.gift_date) as last_gift, sum(g.amount) as lifetime
          from constituents c join gifts g on g.constituent_id = c.id and ${counted}
         where c.org_id = ${orgId} and not c.deceased
           and not exists (select 1 from gifts t where t.constituent_id = c.id and t.posted_at is not null and t.gift_type not in ('soft_credit', 'pledge') and t.gift_date >= ${start}::date)
         group by c.id ${window}
         order by ${id === "lybunt" ? sql`last_year desc` : sql`lifetime desc`}`);
      return {
        columns: [
          { key: "name", label: "Name", kind: "link" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
          ...(id === "lybunt" ? [{ key: "last_year", label: "Last fiscal year", kind: "money" as const }] : []),
          { key: "last_gift", label: "Last gift", kind: "date" }, { key: "lifetime", label: "Lifetime", kind: "money" },
        ],
        rows: rows as Record<string, unknown>[],
      };
    }
    case "lapsed": {
      const rows = await tx.execute(sql`
        select c.id, c.sort_name as name, ${email} as email, ${phone} as phone, max(g.gift_date) as last_gift,
               (array_agg(g.amount order by g.gift_date desc))[1] as last_amount, sum(g.amount) as lifetime
          from constituents c join gifts g on g.constituent_id = c.id and ${counted}
         where c.org_id = ${orgId} and not c.deceased
         group by c.id
        having max(g.gift_date) <= (current_date - interval '13 months')::date and max(g.gift_date) > (current_date - interval '15 months')::date
         order by lifetime desc`);
      return {
        columns: [{ key: "name", label: "Name", kind: "link" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "last_gift", label: "Last gift", kind: "date" }, { key: "last_amount", label: "Last amount", kind: "money" }, { key: "lifetime", label: "Lifetime", kind: "money" }],
        rows: rows as Record<string, unknown>[],
      };
    }
    case "gifts_by_date": {
      const rows = await tx.execute(sql`
        select c.id, c.sort_name as name, g.gift_date, g.amount, f.name as fund, ca.name as campaign, g.payment_method, g.check_number, g.deductible_amount,
               case when g.acknowledged_at is null then 'No' else 'Yes' end as thanked
          from gifts g join constituents c on c.id = g.constituent_id left join funds f on f.id = g.fund_id left join campaigns ca on ca.id = g.campaign_id
         where g.org_id = ${orgId} and ${counted} and g.gift_date between ${from}::date and ${to}::date
         order by g.gift_date, c.sort_name`);
      const total = rows.reduce((s, r) => s + Number((r as { amount: string }).amount), 0);
      return {
        columns: [{ key: "gift_date", label: "Date", kind: "date" }, { key: "name", label: "Donor", kind: "link" }, { key: "amount", label: "Amount", kind: "money" }, { key: "fund", label: "Fund" }, { key: "campaign", label: "Campaign" }, { key: "payment_method", label: "Method" }, { key: "check_number", label: "Check" }, { key: "deductible_amount", label: "Deductible", kind: "money" }, { key: "thanked", label: "Thanked" }],
        rows: rows as Record<string, unknown>[],
        totals: { amount: total.toFixed(2), gift_date: `${rows.length} gifts` },
      };
    }
    case "gifts_by_fund": {
      const rows = await tx.execute(sql`
        select coalesce(f.name, 'No fund') as fund, f.code, count(*)::int as gifts, count(distinct g.constituent_id)::int as donors, sum(g.amount) as total
          from gifts g left join funds f on f.id = g.fund_id
         where g.org_id = ${orgId} and ${counted} and g.gift_date between ${from}::date and ${to}::date
         group by f.name, f.code order by total desc`);
      const total = rows.reduce((s, r) => s + Number((r as { total: string }).total), 0);
      return {
        columns: [{ key: "fund", label: "Fund" }, { key: "code", label: "Code" }, { key: "gifts", label: "Gifts", kind: "number" }, { key: "donors", label: "Donors", kind: "number" }, { key: "total", label: "Total", kind: "money" }],
        rows: rows as Record<string, unknown>[],
        totals: { fund: "All funds", total: total.toFixed(2) },
      };
    }
    case "donors_by_campaign": {
      if (!p.campaignId) return { columns: [], rows: [] };
      const rows = await tx.execute(sql`
        select c.id, c.sort_name as name, ${email} as email, count(*)::int as gifts, sum(g.amount) as total, max(g.gift_date) as last_gift
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
         where g.org_id = ${orgId} and ${counted} and g.acknowledged_at is null
         order by g.gift_date`);
      return {
        columns: [{ key: "gift_date", label: "Date", kind: "date" }, { key: "name", label: "Donor", kind: "link" }, { key: "email", label: "Email" }, { key: "amount", label: "Amount", kind: "money" }, { key: "fund", label: "Fund" }, { key: "days_waiting", label: "Days waiting", kind: "number" }],
        rows: rows as Record<string, unknown>[],
      };
    }
  }
}
