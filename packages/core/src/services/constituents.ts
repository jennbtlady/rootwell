import { sql } from "drizzle-orm";
import type { ConstituentInput, InteractionInput, RelationshipInput } from "../schemas/constituent";
import type { Tx } from "./types";

export type ContactPoint = { id: string; type: string; isPrimary: boolean };
export type Email = ContactPoint & { email: string };
export type Phone = ContactPoint & { phone: string };
export type Address = ContactPoint & { line1: string | null; line2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string };

export type ConstituentSummary = {
  id: string;
  type: "person" | "household" | "organization";
  displayName: string;
  sortName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  city: string | null;
  state: string | null;
  lastGiftOn: string | null;
  lifetimeTotal: string;
  giftCount: number;
  deceased: boolean;
  doNotContact: boolean;
};

export type Constituent = ConstituentSummary & {
  prefix: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
  preferredName: string | null;
  orgName: string | null;
  doNotEmail: boolean;
  doNotMail: boolean;
  doNotCall: boolean;
  deceasedOn: string | null;
  source: string | null;
  assignedTo: string | null;
  notes: string | null;
  customFields: Record<string, string | number | boolean | null>;
  emails: Email[];
  phones: Phone[];
  addresses: Address[];
  tags: { id: string; name: string }[];
  relationships: { id: string; type: string; reciprocalType: string | null; notes: string | null; other: { id: string; displayName: string; type: string } ; direction: "out" | "in" }[];
  firstGiftOn: string | null;
  thisYearTotal: string;
  lastYearTotal: string;
  createdAt: string;
  updatedAt: string;
};

export type SearchHit = { id: string; displayName: string; sortName: string; type: string; primaryEmail: string | null; score: number };

export async function searchConstituents(tx: Tx, orgId: string, q: string, limit = 20): Promise<SearchHit[]> {
  const rows = await tx.execute(sql`select * from app.search_constituents(${orgId}, ${q}, ${limit})`);
  return rows.map((r) => {
    const x = r as { id: string; display_name: string; sort_name: string; type: string; primary_email: string | null; score: number };
    return { id: x.id, displayName: x.display_name, sortName: x.sort_name, type: x.type, primaryEmail: x.primary_email, score: x.score };
  });
}

export type DuplicateCandidate = { id: string; displayName: string; score: number; reasons: string[] };

export async function findDuplicates(
  tx: Tx,
  orgId: string,
  person: { firstName?: string | null; lastName?: string | null; orgName?: string | null; email?: string | null; phone?: string | null; postalCode?: string | null; excludeId?: string | null },
): Promise<DuplicateCandidate[]> {
  const first = person.firstName ?? (person.orgName ? person.orgName : null);
  const rows = await tx.execute(sql`
    select * from app.find_duplicates(${orgId}, ${first ?? null}, ${person.lastName ?? null}, ${person.email ?? null}, ${person.phone ?? null}, ${person.postalCode ?? null}, ${person.excludeId ?? null})
  `);
  return rows.map((r) => {
    const x = r as { id: string; display_name: string; score: number; reasons: string[] };
    return { id: x.id, displayName: x.display_name, score: x.score, reasons: x.reasons };
  });
}

const summarySelect = sql`
  c.id, c.type, c.display_name, c.sort_name, c.deceased, c.do_not_contact,
  (select e.email from constituent_emails e where e.constituent_id = c.id order by e.is_primary desc, e.created_at limit 1) as primary_email,
  (select p.phone from constituent_phones p where p.constituent_id = c.id order by p.is_primary desc, p.created_at limit 1) as primary_phone,
  (select a.city from constituent_addresses a where a.constituent_id = c.id order by a.is_primary desc, a.created_at limit 1) as city,
  (select a.state from constituent_addresses a where a.constituent_id = c.id order by a.is_primary desc, a.created_at limit 1) as state,
  g.last_gift_on, coalesce(g.lifetime_total, 0)::text as lifetime_total, coalesce(g.gift_count, 0)::int as gift_count
`;
const giftJoin = sql`
  left join (select constituent_id, max(gift_date) as last_gift_on, sum(amount) as lifetime_total, count(*) as gift_count,
                    min(gift_date) as first_gift_on,
                    sum(amount) filter (where gift_date >= date_trunc('year', current_date)) as this_year_total,
                    sum(amount) filter (where gift_date >= date_trunc('year', current_date) - interval '1 year' and gift_date < date_trunc('year', current_date)) as last_year_total
               from gifts where gift_type <> 'soft_credit' group by constituent_id) g on g.constituent_id = c.id
`;

function mapSummary(r: Record<string, unknown>): ConstituentSummary {
  return {
    id: r.id as string,
    type: r.type as ConstituentSummary["type"],
    displayName: r.display_name as string,
    sortName: r.sort_name as string,
    primaryEmail: (r.primary_email as string | null) ?? null,
    primaryPhone: (r.primary_phone as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    state: (r.state as string | null) ?? null,
    lastGiftOn: (r.last_gift_on as string | null) ?? null,
    lifetimeTotal: String(r.lifetime_total ?? "0"),
    giftCount: Number(r.gift_count ?? 0),
    deceased: Boolean(r.deceased),
    doNotContact: Boolean(r.do_not_contact),
  };
}

export async function listConstituents(tx: Tx, orgId: string, opts: { q?: string; limit?: number; offset?: number } = {}): Promise<{ items: ConstituentSummary[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const q = (opts.q ?? "").trim();
  if (q) {
    const hits = await searchConstituents(tx, orgId, q, limit);
    if (hits.length === 0) return { items: [], total: 0 };
    const ids = hits.map((h) => h.id);
    const rows = await tx.execute(sql`select ${summarySelect} from constituents c ${giftJoin} where c.id = any(${ids}::uuid[])`);
    const byId = new Map(rows.map((r) => [(r as { id: string }).id, mapSummary(r as Record<string, unknown>)]));
    return { items: ids.map((id) => byId.get(id)!).filter(Boolean), total: hits.length };
  }
  const rows = await tx.execute(sql`
    select ${summarySelect}, count(*) over() as total
      from constituents c ${giftJoin}
     where c.org_id = ${orgId}
     order by c.sort_name
     limit ${limit} offset ${offset}
  `);
  return { items: rows.map((r) => mapSummary(r as Record<string, unknown>)), total: Number((rows[0] as { total?: number } | undefined)?.total ?? 0) };
}

export async function getConstituent(tx: Tx, orgId: string, id: string): Promise<Constituent | null> {
  const rows = await tx.execute(sql`
    select ${summarySelect}, c.prefix, c.first_name, c.middle_name, c.last_name, c.suffix, c.preferred_name, c.org_name,
           c.do_not_email, c.do_not_mail, c.do_not_call, c.deceased_on, c.source, c.assigned_to, c.notes, c.custom_fields,
           c.created_at, c.updated_at, g.first_gift_on, coalesce(g.this_year_total, 0)::text as this_year_total, coalesce(g.last_year_total, 0)::text as last_year_total,
           (select coalesce(json_agg(json_build_object('id', e.id, 'email', e.email, 'type', e.type, 'isPrimary', e.is_primary) order by e.is_primary desc, e.created_at), '[]') from constituent_emails e where e.constituent_id = c.id) as emails,
           (select coalesce(json_agg(json_build_object('id', p.id, 'phone', p.phone, 'type', p.type, 'isPrimary', p.is_primary) order by p.is_primary desc, p.created_at), '[]') from constituent_phones p where p.constituent_id = c.id) as phones,
           (select coalesce(json_agg(json_build_object('id', a.id, 'line1', a.line1, 'line2', a.line2, 'city', a.city, 'state', a.state, 'postalCode', a.postal_code, 'country', a.country, 'type', a.type, 'isPrimary', a.is_primary) order by a.is_primary desc, a.created_at), '[]') from constituent_addresses a where a.constituent_id = c.id) as addresses,
           (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name) order by t.name), '[]') from constituent_tags ct join tags t on t.id = ct.tag_id where ct.constituent_id = c.id) as tags,
           (select coalesce(json_agg(json_build_object('id', r.id, 'type', case when r.from_constituent_id = c.id then r.type else coalesce(r.reciprocal_type, r.type) end,
                     'reciprocalType', case when r.from_constituent_id = c.id then r.reciprocal_type else r.type end, 'notes', r.notes,
                     'direction', case when r.from_constituent_id = c.id then 'out' else 'in' end,
                     'other', json_build_object('id', o.id, 'displayName', o.display_name, 'type', o.type)) order by o.sort_name), '[]')
              from relationships r join constituents o on o.id = case when r.from_constituent_id = c.id then r.to_constituent_id else r.from_constituent_id end
             where r.from_constituent_id = c.id or r.to_constituent_id = c.id) as relationships
      from constituents c ${giftJoin}
     where c.id = ${id} and c.org_id = ${orgId}
  `);
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    ...mapSummary(r),
    prefix: (r.prefix as string | null) ?? null,
    firstName: (r.first_name as string | null) ?? null,
    middleName: (r.middle_name as string | null) ?? null,
    lastName: (r.last_name as string | null) ?? null,
    suffix: (r.suffix as string | null) ?? null,
    preferredName: (r.preferred_name as string | null) ?? null,
    orgName: (r.org_name as string | null) ?? null,
    doNotEmail: Boolean(r.do_not_email),
    doNotMail: Boolean(r.do_not_mail),
    doNotCall: Boolean(r.do_not_call),
    deceasedOn: (r.deceased_on as string | null) ?? null,
    source: (r.source as string | null) ?? null,
    assignedTo: (r.assigned_to as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    customFields: (r.custom_fields as Constituent["customFields"]) ?? {},
    emails: r.emails as Email[],
    phones: r.phones as Phone[],
    addresses: r.addresses as Address[],
    tags: r.tags as Constituent["tags"],
    relationships: r.relationships as Constituent["relationships"],
    firstGiftOn: (r.first_gift_on as string | null) ?? null,
    thisYearTotal: String(r.this_year_total ?? "0"),
    lastYearTotal: String(r.last_year_total ?? "0"),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

async function writeContactPoints(tx: Tx, orgId: string, id: string, input: ConstituentInput) {
  await tx.execute(sql`delete from constituent_emails where constituent_id = ${id}`);
  await tx.execute(sql`delete from constituent_phones where constituent_id = ${id}`);
  await tx.execute(sql`delete from constituent_addresses where constituent_id = ${id}`);
  for (const [i, e] of input.emails.entries()) {
    await tx.execute(sql`insert into constituent_emails (org_id, constituent_id, email, type, is_primary) values (${orgId}, ${id}, ${e.email}, ${e.type}::contact_point_type, ${e.isPrimary || (i === 0 && !input.emails.some((x) => x.isPrimary))})`);
  }
  for (const [i, p] of input.phones.entries()) {
    await tx.execute(sql`insert into constituent_phones (org_id, constituent_id, phone, type, is_primary) values (${orgId}, ${id}, ${p.phone}, ${p.type}::contact_point_type, ${p.isPrimary || (i === 0 && !input.phones.some((x) => x.isPrimary))})`);
  }
  for (const [i, a] of input.addresses.entries()) {
    await tx.execute(sql`
      insert into constituent_addresses (org_id, constituent_id, line1, line2, city, state, postal_code, country, type, is_primary)
      values (${orgId}, ${id}, ${a.line1}, ${a.line2}, ${a.city}, ${a.state}, ${a.postalCode}, ${a.country}, ${a.type}::contact_point_type, ${a.isPrimary || (i === 0 && !input.addresses.some((x) => x.isPrimary))})`);
  }
}

const coreColumns = (c: ConstituentInput) => sql`
  type = ${c.type}::constituent_type, prefix = ${c.prefix}, first_name = ${c.firstName}, middle_name = ${c.middleName}, last_name = ${c.lastName},
  suffix = ${c.suffix}, preferred_name = ${c.preferredName}, org_name = ${c.orgName}, do_not_contact = ${c.doNotContact}, do_not_email = ${c.doNotEmail},
  do_not_mail = ${c.doNotMail}, do_not_call = ${c.doNotCall}, deceased = ${c.deceased}, deceased_on = ${c.deceasedOn ?? null}, source = ${c.source},
  assigned_to = ${c.assignedTo ?? null}, notes = ${c.notes ?? null}, custom_fields = ${JSON.stringify(c.customFields)}::jsonb
`;

export async function createConstituent(tx: Tx, orgId: string, input: ConstituentInput): Promise<{ id: string }> {
  const r = await tx.execute(sql`
    insert into constituents (org_id, type, prefix, first_name, middle_name, last_name, suffix, preferred_name, org_name, do_not_contact, do_not_email, do_not_mail, do_not_call, deceased, deceased_on, source, assigned_to, notes, custom_fields)
    values (${orgId}, ${input.type}::constituent_type, ${input.prefix}, ${input.firstName}, ${input.middleName}, ${input.lastName}, ${input.suffix}, ${input.preferredName}, ${input.orgName},
            ${input.doNotContact}, ${input.doNotEmail}, ${input.doNotMail}, ${input.doNotCall}, ${input.deceased}, ${input.deceasedOn ?? null}, ${input.source}, ${input.assignedTo ?? null}, ${input.notes ?? null}, ${JSON.stringify(input.customFields)}::jsonb)
    returning id
  `);
  const id = (r[0] as { id: string }).id;
  await writeContactPoints(tx, orgId, id, input);
  return { id };
}

export async function updateConstituent(tx: Tx, orgId: string, id: string, input: ConstituentInput): Promise<boolean> {
  const r = await tx.execute(sql`update constituents set ${coreColumns(input)} where id = ${id} and org_id = ${orgId}`);
  if (r.count === 0) return false;
  await writeContactPoints(tx, orgId, id, input);
  return true;
}

export async function deleteConstituent(tx: Tx, orgId: string, id: string): Promise<boolean> {
  const r = await tx.execute(sql`delete from constituents where id = ${id} and org_id = ${orgId}`);
  return r.count > 0;
}

// ---- tags
export async function listTags(tx: Tx, orgId: string): Promise<{ id: string; name: string; count: number }[]> {
  const rows = await tx.execute(sql`
    select t.id, t.name, (select count(*) from constituent_tags ct where ct.tag_id = t.id)::int as count
      from tags t where t.org_id = ${orgId} order by t.name`);
  return rows.map((r) => r as { id: string; name: string; count: number });
}

export async function createTag(tx: Tx, orgId: string, name: string): Promise<{ id: string }> {
  const r = await tx.execute(sql`insert into tags (org_id, name) values (${orgId}, ${name}) on conflict (org_id, name) do update set name = excluded.name returning id`);
  return { id: (r[0] as { id: string }).id };
}

export async function setConstituentTags(tx: Tx, orgId: string, constituentId: string, tagIds: string[]): Promise<void> {
  await tx.execute(sql`delete from constituent_tags where constituent_id = ${constituentId} and org_id = ${orgId} and not (tag_id = any(${tagIds}::uuid[]))`);
  for (const tagId of tagIds) {
    await tx.execute(sql`insert into constituent_tags (org_id, constituent_id, tag_id) values (${orgId}, ${constituentId}, ${tagId}) on conflict do nothing`);
  }
}

// ---- relationships
export async function addRelationship(tx: Tx, orgId: string, fromId: string, input: RelationshipInput): Promise<{ id: string }> {
  const r = await tx.execute(sql`
    insert into relationships (org_id, from_constituent_id, to_constituent_id, type, reciprocal_type, notes)
    values (${orgId}, ${fromId}, ${input.toConstituentId}, ${input.type}, ${input.reciprocalType ?? null}, ${input.notes ?? null}) returning id`);
  return { id: (r[0] as { id: string }).id };
}

export async function removeRelationship(tx: Tx, orgId: string, id: string): Promise<boolean> {
  const r = await tx.execute(sql`delete from relationships where id = ${id} and org_id = ${orgId}`);
  return r.count > 0;
}

// ---- interactions
export type Interaction = { id: string; type: string; occurredOn: string; summary: string; details: string | null; ownerId: string | null; ownerName: string | null; createdAt: string };

export async function listInteractions(tx: Tx, orgId: string, constituentId: string, limit = 50): Promise<Interaction[]> {
  const rows = await tx.execute(sql`
    select i.id, i.type, i.occurred_on, i.summary, i.details, i.owner_id, coalesce(p.full_name, p.email) as owner_name, i.created_at
      from interactions i left join profiles p on p.id = i.owner_id
     where i.constituent_id = ${constituentId} and i.org_id = ${orgId}
     order by i.occurred_on desc, i.created_at desc limit ${limit}`);
  return rows.map((r) => {
    const x = r as Record<string, unknown>;
    return { id: x.id as string, type: x.type as string, occurredOn: String(x.occurred_on), summary: x.summary as string, details: (x.details as string | null) ?? null, ownerId: (x.owner_id as string | null) ?? null, ownerName: (x.owner_name as string | null) ?? null, createdAt: String(x.created_at) };
  });
}

export async function addInteraction(tx: Tx, orgId: string, constituentId: string, input: InteractionInput, defaultOwner: string | null): Promise<{ id: string }> {
  const r = await tx.execute(sql`
    insert into interactions (org_id, constituent_id, type, occurred_on, summary, details, owner_id)
    values (${orgId}, ${constituentId}, ${input.type}::interaction_type, ${input.occurredOn}, ${input.summary}, ${input.details ?? null}, ${input.ownerId ?? defaultOwner}) returning id`);
  return { id: (r[0] as { id: string }).id };
}

export async function deleteInteraction(tx: Tx, orgId: string, id: string): Promise<boolean> {
  const r = await tx.execute(sql`delete from interactions where id = ${id} and org_id = ${orgId}`);
  return r.count > 0;
}
