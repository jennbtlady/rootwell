import { sql } from "drizzle-orm";
import { DEFAULT_EMAIL, DEFAULT_LETTER, renderTemplate, substantiation, type MergeContext } from "../acknowledgments";
import type { Tx } from "./types";

export type AckTemplate = { id: string; name: string; channel: "letter" | "email"; subject: string | null; body: string; signature: string | null; isDefault: boolean };

export async function listTemplates(tx: Tx, orgId: string): Promise<AckTemplate[]> {
  let rows = await tx.execute(sql`select id, name, channel, subject, body, signature, is_default from acknowledgment_templates where org_id = ${orgId} order by channel, name`);
  if (rows.length === 0) {
    // First visit: start every organization with the two defaults. Staff cannot write
    // templates, so this only seeds when an owner or admin looks.
    const role = await tx.execute(sql`select app.has_role(${orgId}, '{owner,admin}') as ok`);
    if ((role[0] as { ok: boolean }).ok) {
      for (const t of [DEFAULT_LETTER, DEFAULT_EMAIL]) {
        await tx.execute(sql`insert into acknowledgment_templates (org_id, name, channel, subject, body, signature, is_default) values (${orgId}, ${t.name}, ${t.channel}::ack_channel, ${t.subject}, ${t.body}, ${t.signature}, true) on conflict do nothing`);
      }
      rows = await tx.execute(sql`select id, name, channel, subject, body, signature, is_default from acknowledgment_templates where org_id = ${orgId} order by channel, name`);
    } else {
      return [
        { id: "default-letter", name: DEFAULT_LETTER.name, channel: "letter", subject: null, body: DEFAULT_LETTER.body, signature: DEFAULT_LETTER.signature, isDefault: true },
        { id: "default-email", name: DEFAULT_EMAIL.name, channel: "email", subject: DEFAULT_EMAIL.subject, body: DEFAULT_EMAIL.body, signature: DEFAULT_EMAIL.signature, isDefault: true },
      ];
    }
  }
  return rows.map((r) => {
    const x = r as Record<string, unknown>;
    return { id: x.id as string, name: x.name as string, channel: x.channel as AckTemplate["channel"], subject: (x.subject as string | null) ?? null, body: x.body as string, signature: (x.signature as string | null) ?? null, isDefault: Boolean(x.is_default) };
  });
}

export async function saveTemplate(tx: Tx, orgId: string, t: { id?: string; name: string; channel: "letter" | "email"; subject: string | null; body: string; signature: string | null }): Promise<{ id: string }> {
  const r = t.id
    ? await tx.execute(sql`update acknowledgment_templates set name = ${t.name}, channel = ${t.channel}::ack_channel, subject = ${t.subject}, body = ${t.body}, signature = ${t.signature} where id = ${t.id} and org_id = ${orgId} returning id`)
    : await tx.execute(sql`insert into acknowledgment_templates (org_id, name, channel, subject, body, signature) values (${orgId}, ${t.name}, ${t.channel}::ack_channel, ${t.subject}, ${t.body}, ${t.signature}) returning id`);
  return { id: (r[0] as { id: string }).id };
}

export type QueueItem = {
  giftId: string;
  constituentId: string;
  name: string;
  email: string | null;
  hasAddress: boolean;
  doNotEmail: boolean;
  doNotMail: boolean;
  amount: string;
  giftDate: string;
  fund: string | null;
  daysWaiting: number;
};

/** Gifts entered but not posted yet. They join the queue when their batch is posted, so the page says they exist. */
export async function unpostedGifts(tx: Tx, orgId: string): Promise<{ gifts: number; batches: number }> {
  const r = await tx.execute(sql`
    select count(*)::int as gifts, count(distinct g.batch_id)::int as batches
      from gifts g where g.org_id = ${orgId} and g.posted_at is null and g.gift_type not in ('soft_credit', 'pledge')`);
  const x = r[0] as { gifts: number; batches: number };
  return { gifts: x.gifts, batches: x.batches };
}

export async function listAckQueue(tx: Tx, orgId: string, opts: { limit?: number; offset?: number } = {}): Promise<{ items: QueueItem[]; total: number }> {
  const rows = await tx.execute(sql`
    select g.id as gift_id, c.id as constituent_id, c.display_name as name,
           (select e.email from constituent_emails e where e.constituent_id = c.id order by e.is_primary desc limit 1) as email,
           exists (select 1 from constituent_addresses a where a.constituent_id = c.id and coalesce(a.line1, '') <> '') as has_address,
           (c.do_not_email or c.do_not_contact) as do_not_email, (c.do_not_mail or c.do_not_contact) as do_not_mail,
           g.amount::text, g.gift_date::text, f.name as fund, (current_date - g.gift_date) as days_waiting, count(*) over() as total
      from gifts g join constituents c on c.id = g.constituent_id left join funds f on f.id = g.fund_id
     where g.org_id = ${orgId} and g.posted_at is not null and g.acknowledged_at is null and g.gift_type not in ('soft_credit', 'pledge')
     order by g.gift_date, c.sort_name
     limit ${opts.limit ?? 100} offset ${opts.offset ?? 0}`);
  return {
    items: rows.map((r) => {
      const x = r as Record<string, unknown>;
      return { giftId: x.gift_id as string, constituentId: x.constituent_id as string, name: x.name as string, email: (x.email as string | null) ?? null, hasAddress: Boolean(x.has_address), doNotEmail: Boolean(x.do_not_email), doNotMail: Boolean(x.do_not_mail), amount: x.amount as string, giftDate: x.gift_date as string, fund: (x.fund as string | null) ?? null, daysWaiting: Number(x.days_waiting) };
    }),
    total: Number((rows[0] as { total?: number } | undefined)?.total ?? 0),
  };
}

export type OrgLetterhead = { name: string; ein: string | null; address: string };

export type AckDocument = {
  giftId: string;
  constituentId: string;
  to: { name: string; email: string | null; addressLines: string[] };
  doNotEmail: boolean;
  subject: string | null;
  body: string;
  signature: string | null;
};

const money = (v: string | number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
const longDate = (d: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`));

export async function letterhead(tx: Tx, orgId: string): Promise<OrgLetterhead> {
  const r = await tx.execute(sql`select name, ein, address from organizations where id = ${orgId}`);
  const o = r[0] as { name: string; ein: string | null; address: Record<string, string> };
  const a = o.address ?? {};
  return { name: o.name, ein: o.ein, address: [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", "), a.postalCode].filter(Boolean).join(", ") };
}

/** Renders the template for each gift. The same output feeds emails and letters. */
export async function renderAcks(tx: Tx, orgId: string, giftIds: string[], template: AckTemplate): Promise<{ org: OrgLetterhead; docs: AckDocument[] }> {
  const org = await letterhead(tx, orgId);
  if (!giftIds.length) return { org, docs: [] };
  const ids = sql.join(giftIds.map((id) => sql`${id}::uuid`), sql`, `);
  const rows = await tx.execute(sql`
    select g.id, g.amount::text, g.deductible_amount::text, g.gift_type, g.gift_date::text, g.notes, f.name as fund, ca.name as campaign,
           c.id as constituent_id, c.display_name, c.first_name, c.preferred_name, c.org_name, c.type, (c.do_not_email or c.do_not_contact) as do_not_email,
           (select e.email from constituent_emails e where e.constituent_id = c.id order by e.is_primary desc limit 1) as email,
           (select row_to_json(a) from constituent_addresses a where a.constituent_id = c.id order by a.is_primary desc limit 1) as address
      from gifts g join constituents c on c.id = g.constituent_id left join funds f on f.id = g.fund_id left join campaigns ca on ca.id = g.campaign_id
     where g.org_id = ${orgId} and g.id in (${ids}) and g.posted_at is not null
     order by c.sort_name, g.gift_date`);
  const today = new Date().toISOString().slice(0, 10);
  const docs = rows.map((r) => {
    const x = r as Record<string, any>;
    const salutation = x.type === "person" ? (x.preferred_name || x.first_name || x.display_name) : x.org_name || x.display_name;
    const ctx: MergeContext = {
      salutation,
      donor_name: x.display_name,
      first_name: x.first_name ?? "",
      gift_amount: money(x.amount),
      gift_date: longDate(x.gift_date),
      fund: x.fund ?? "our work",
      campaign: x.campaign ?? "",
      deductible_amount: money(x.deductible_amount ?? x.amount),
      substantiation: substantiation({ amount: x.amount, deductibleAmount: x.deductible_amount, giftType: x.gift_type, giftDate: x.gift_date, notes: x.notes }, org.name),
      org_name: org.name,
      org_ein: org.ein ?? "(add your EIN in settings)",
      org_address: org.address,
      today: longDate(today),
    };
    const a = x.address as Record<string, string> | null;
    return {
      giftId: x.id,
      constituentId: x.constituent_id,
      to: { name: x.display_name, email: x.email ?? null, addressLines: a ? [a.line1, a.line2, [[a.city, a.state].filter(Boolean).join(", "), a.postal_code].filter(Boolean).join(" ")].filter((l): l is string => Boolean(l)) : [] },
      doNotEmail: Boolean(x.do_not_email),
      subject: template.subject ? renderTemplate(template.subject, ctx) : null,
      body: renderTemplate(template.body, ctx),
      signature: template.signature ? renderTemplate(template.signature, ctx) : null,
    };
  });
  return { org, docs };
}

export async function recordAcks(tx: Tx, orgId: string, entries: { giftId: string; channel: "letter" | "email" | "phone" | "in_person"; status: "sent" | "marked" | "failed"; recipient: string | null; error: string | null; templateId: string | null }[]): Promise<void> {
  if (!entries.length) return;
  await tx.execute(sql`
    insert into acknowledgments (org_id, gift_id, template_id, channel, status, recipient, error)
    select ${orgId}, (x->>'giftId')::uuid, nullif(x->>'templateId', '')::uuid, (x->>'channel')::ack_channel, (x->>'status')::ack_status, x->>'recipient', x->>'error'
      from jsonb_array_elements(${JSON.stringify(entries.map((e) => ({ ...e, templateId: e.templateId && /^[0-9a-f-]{36}$/.test(e.templateId) ? e.templateId : "" })))}::jsonb) x`);
  const done = entries.filter((e) => e.status !== "failed");
  const byMethod = new Map<string, string[]>();
  for (const e of done) byMethod.set(e.channel, [...(byMethod.get(e.channel) ?? []), e.giftId]);
  for (const [method, ids] of byMethod) {
    await tx.execute(sql`select app.acknowledge_gifts(array[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}], ${method})`);
  }
}

// ---- annual statements
export type StatementDonor = {
  constituentId: string;
  name: string;
  email: string | null;
  doNotEmail: boolean;
  addressLines: string[];
  gifts: { date: string; amount: string; deductible: string; fund: string | null; received: string }[];
  total: string;
  deductibleTotal: string;
  /** When this year's statement was emailed or downloaded for printing, if it was. */
  emailedAt: string | null;
  printedAt: string | null;
};

export async function statementDonors(tx: Tx, orgId: string, year: number, constituentIds?: string[]): Promise<StatementDonor[]> {
  const only = constituentIds?.length ? sql`and c.id in (${sql.join(constituentIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
  const rows = await tx.execute(sql`
    select c.id, c.display_name, c.sort_name, (c.do_not_email or c.do_not_contact) as do_not_email,
           (select e.email from constituent_emails e where e.constituent_id = c.id order by e.is_primary desc limit 1) as email,
           (select row_to_json(a) from constituent_addresses a where a.constituent_id = c.id order by a.is_primary desc limit 1) as address,
           json_agg(json_build_object('date', g.gift_date, 'amount', g.amount::text, 'deductible', coalesce(g.deductible_amount, g.amount)::text, 'fund', f.name,
                    'received', (g.amount - coalesce(g.deductible_amount, g.amount))::text) order by g.gift_date) as gifts,
           sum(g.amount)::text as total, sum(coalesce(g.deductible_amount, g.amount))::text as deductible_total,
           (select max(s.sent_at) from statement_sends s where s.constituent_id = c.id and s.tax_year = ${year} and s.channel = 'email' and s.status = 'sent') as emailed_at,
           (select max(s.sent_at) from statement_sends s where s.constituent_id = c.id and s.tax_year = ${year} and s.channel = 'print' and s.status = 'sent') as printed_at
      from gifts g join constituents c on c.id = g.constituent_id left join funds f on f.id = g.fund_id
     where g.org_id = ${orgId} and g.posted_at is not null and g.gift_type not in ('soft_credit', 'pledge')
       and g.gift_date >= make_date(${year}, 1, 1) and g.gift_date < make_date(${year + 1}, 1, 1) and not c.deceased ${only}
     group by c.id order by c.sort_name`);
  return rows.map((r) => {
    const x = r as Record<string, any>;
    const a = x.address as Record<string, string> | null;
    return {
      constituentId: x.id, name: x.display_name, email: x.email ?? null, doNotEmail: Boolean(x.do_not_email),
      addressLines: a ? [a.line1, a.line2, [[a.city, a.state].filter(Boolean).join(", "), a.postal_code].filter(Boolean).join(" ")].filter((l): l is string => Boolean(l)) : [],
      gifts: x.gifts, total: x.total, deductibleTotal: x.deductible_total,
      emailedAt: x.emailed_at ? new Date(x.emailed_at).toISOString() : null,
      printedAt: x.printed_at ? new Date(x.printed_at).toISOString() : null,
    };
  });
}

/** Donors whose statement goes by mail: no usable email, or they asked for no email. */
export const toPrint = (d: Pick<StatementDonor, "email" | "doNotEmail">) => !d.email || d.doNotEmail;

/** Records statements that went out, one row per donor, year and channel (a resend updates it). */
export async function recordStatementSends(
  tx: Tx,
  orgId: string,
  year: number,
  rows: { constituentId: string; channel: "email" | "print"; status: "sent" | "failed"; recipient: string | null; error: string | null }[],
): Promise<void> {
  for (const r of rows) {
    await tx.execute(sql`
      insert into statement_sends (org_id, constituent_id, tax_year, channel, status, recipient, error, sent_at)
      values (${orgId}, ${r.constituentId}, ${year}, ${r.channel}, ${r.status}, ${r.recipient}, ${r.error}, now())
      on conflict (org_id, constituent_id, tax_year, channel)
      do update set status = excluded.status, recipient = excluded.recipient, error = excluded.error, sent_at = now()`);
  }
}
