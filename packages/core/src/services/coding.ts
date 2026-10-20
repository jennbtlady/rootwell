import { sql } from "drizzle-orm";
import type { AppealInput, CampaignInput, CodingKind, FundInput } from "../schemas/coding";
import type { Tx } from "./types";

export type CodingRow = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  active: boolean;
  startsOn: string | null;
  endsOn: string | null;
  goalAmount?: string | null;
  campaignId?: string | null;
  giftCount: number;
  giftTotal: string;
};

const TABLE: Record<CodingKind, string> = { funds: "funds", campaigns: "campaigns", appeals: "appeals" };
const GIFT_COL: Record<CodingKind, string> = { funds: "fund_id", campaigns: "campaign_id", appeals: "appeal_id" };

function mapRow(r: Record<string, unknown>): CodingRow {
  return {
    id: r.id as string,
    name: r.name as string,
    code: (r.code as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    active: r.active as boolean,
    startsOn: (r.starts_on as string | null) ?? null,
    endsOn: (r.ends_on as string | null) ?? null,
    ...(r.goal_amount !== undefined ? { goalAmount: (r.goal_amount as string | null) ?? null } : {}),
    ...(r.campaign_id !== undefined ? { campaignId: (r.campaign_id as string | null) ?? null } : {}),
    giftCount: Number(r.gift_count ?? 0),
    giftTotal: String(r.gift_total ?? "0.00"),
  };
}

export async function listCoding(tx: Tx, kind: CodingKind, orgId: string, opts: { includeInactive?: boolean } = {}): Promise<CodingRow[]> {
  const t = sql.identifier(TABLE[kind]);
  const col = sql.identifier(GIFT_COL[kind]);
  const rows = await tx.execute(sql`
    select c.*, coalesce(g.n, 0) as gift_count, coalesce(g.total, 0)::text as gift_total
      from ${t} c
      left join (select ${col} as id, count(*) as n, sum(amount) as total from gifts where org_id = ${orgId} group by ${col}) g on g.id = c.id
     where c.org_id = ${orgId} ${opts.includeInactive ? sql`` : sql`and c.active`}
     order by c.active desc, c.name
  `);
  return rows.map((r) => mapRow(r as Record<string, unknown>));
}

type AnyCodingInput = FundInput | CampaignInput | AppealInput;

export async function createCoding(tx: Tx, kind: CodingKind, orgId: string, input: AnyCodingInput): Promise<{ id: string }> {
  const t = sql.identifier(TABLE[kind]);
  const goal = "goalAmount" in input ? input.goalAmount ?? null : null;
  const campaign = "campaignId" in input ? input.campaignId ?? null : null;
  const extraCols = kind === "campaigns" ? sql`, goal_amount` : kind === "appeals" ? sql`, campaign_id` : sql``;
  const extraVals = kind === "campaigns" ? sql`, ${goal}` : kind === "appeals" ? sql`, ${campaign}` : sql``;
  const r = await tx.execute(sql`
    insert into ${t} (org_id, name, code, description, active, starts_on, ends_on ${extraCols})
    values (${orgId}, ${input.name}, ${input.code ?? null}, ${input.description ?? null}, ${input.active}, ${input.startsOn ?? null}, ${input.endsOn ?? null} ${extraVals})
    returning id
  `);
  return { id: (r[0] as { id: string }).id };
}

export async function updateCoding(tx: Tx, kind: CodingKind, orgId: string, id: string, input: AnyCodingInput): Promise<boolean> {
  const t = sql.identifier(TABLE[kind]);
  const goal = "goalAmount" in input ? input.goalAmount ?? null : null;
  const campaign = "campaignId" in input ? input.campaignId ?? null : null;
  const extra = kind === "campaigns" ? sql`, goal_amount = ${goal}` : kind === "appeals" ? sql`, campaign_id = ${campaign}` : sql``;
  const r = await tx.execute(sql`
    update ${t} set name = ${input.name}, code = ${input.code ?? null}, description = ${input.description ?? null}, active = ${input.active},
           starts_on = ${input.startsOn ?? null}, ends_on = ${input.endsOn ?? null} ${extra}
     where id = ${id} and org_id = ${orgId}
  `);
  return r.count > 0;
}
