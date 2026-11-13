import { sql } from "drizzle-orm";
import type { Tx } from "./types";

/**
 * The Fundraising side's Overview (docs/navigation.md): how online giving is going this
 * fiscal year, what is set up, and the latest online gifts. Refund entries net out of the
 * total and never count as gifts.
 */
export type FundraisingOverview = {
  fiscalYearStart: string;
  onlineTotal: string;
  onlineGifts: number;
  onlineDonors: number;
  monthlyDonors: number;
  monthlyPerMonth: string;
  pagesOn: number;
  setup: { stripe: "connected" | "needs_info" | "none"; hasPage: boolean; receiptsReplyTo: boolean; branded: boolean };
  recent: {
    id: string;
    constituentId: string;
    name: string;
    amount: string;
    giftDate: string;
    fund: string | null;
    giftType: string;
    sponsorAnimalName: string | null;
    tribute: { kind: "honor" | "memory"; honoreeName: string } | null;
    donorMessage: string | null;
  }[];
};

export async function fundraisingOverview(tx: Tx, orgId: string): Promise<FundraisingOverview | null> {
  const t = await tx.execute(sql`
    select app.fiscal_year_start(current_date, o.fiscal_year_start_month)::text as fy,
           o.receipts->>'replyTo' as reply_to, (o.branding <> '{}'::jsonb or o.logo_path is not null) as branded,
           (select i.status::text from integrations i where i.org_id = o.id and i.provider = 'stripe' and i.status in ('connected', 'needs_info')) as stripe,
           (select count(*) from donation_pages p where p.org_id = o.id)::int as pages,
           (select count(*) from donation_pages p where p.org_id = o.id and p.active)::int as pages_on,
           (select count(*) from recurring_plans r where r.org_id = o.id and r.status = 'active' and r.external_source = 'stripe')::int as monthly,
           (select coalesce(sum(r.amount), 0)::text from recurring_plans r where r.org_id = o.id and r.status = 'active' and r.external_source = 'stripe') as monthly_amount
      from organizations o where o.id = ${orgId}`);
  if (!t.length) return null;
  const x = t[0] as Record<string, unknown>;
  const fy = String(x.fy);
  const totals = await tx.execute(sql`
    select coalesce(sum(amount), 0)::text as total,
           (count(*) filter (where gift_type <> 'refund'))::int as gifts,
           (count(distinct constituent_id) filter (where gift_type <> 'refund'))::int as donors
      from gifts where org_id = ${orgId} and external_source = 'stripe' and gift_date >= ${fy}::date`);
  const y = totals[0] as { total: string; gifts: number; donors: number };
  const recent = await tx.execute(sql`
    select g.id, g.constituent_id, c.display_name, g.amount::text, g.gift_date::text, f.name as fund, g.gift_type, a.name as animal,
           t.kind as t_kind, t.honoree_name, g.donor_message
      from gifts g join constituents c on c.id = g.constituent_id
      left join funds f on f.id = g.fund_id
      left join sponsor_animals a on a.id = g.sponsor_animal_id
      left join gift_tributes t on t.gift_id = g.id
     where g.org_id = ${orgId} and g.external_source = 'stripe'
     order by g.created_at desc limit 8`);
  return {
    fiscalYearStart: fy,
    onlineTotal: y.total,
    onlineGifts: y.gifts,
    onlineDonors: y.donors,
    monthlyDonors: Number(x.monthly),
    monthlyPerMonth: String(x.monthly_amount),
    pagesOn: Number(x.pages_on),
    setup: {
      stripe: (x.stripe as "connected" | "needs_info" | null) ?? "none",
      hasPage: Number(x.pages) > 0,
      receiptsReplyTo: Boolean(x.reply_to),
      branded: Boolean(x.branded),
    },
    recent: recent.map((r) => {
      const g = r as Record<string, unknown>;
      return {
        id: g.id as string,
        constituentId: g.constituent_id as string,
        name: g.display_name as string,
        amount: g.amount as string,
        giftDate: g.gift_date as string,
        fund: (g.fund as string | null) ?? null,
        giftType: g.gift_type as string,
        sponsorAnimalName: (g.animal as string | null) ?? null,
        tribute: g.t_kind ? { kind: g.t_kind as "honor" | "memory", honoreeName: g.honoree_name as string } : null,
        donorMessage: (g.donor_message as string | null) ?? null,
      };
    }),
  };
}
