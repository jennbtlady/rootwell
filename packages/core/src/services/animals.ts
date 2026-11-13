import { sql } from "drizzle-orm";
import type { SponsorAnimalInput } from "../schemas/integrations";
import type { Tx } from "./types";

/**
 * Animals a donor can sponsor (fundraising Phase 2). Staff see the list; owners and admins
 * change it. An animal with gifts is hidden, never deleted, so its gifts keep their animal.
 */
export type SponsorAnimal = SponsorAnimalInput & { id: string; fundName: string | null; giftCount: number };

const map = (r: Record<string, unknown>): SponsorAnimal => ({
  id: r.id as string,
  name: r.name as string,
  description: (r.description as string | null) ?? null,
  photoPath: (r.photo_path as string | null) ?? null,
  fundId: (r.fund_id as string | null) ?? null,
  fundName: (r.fund_name as string | null) ?? null,
  active: Boolean(r.active),
  sortOrder: Number(r.sort_order),
  giftCount: Number(r.gift_count ?? 0),
});

export async function listAnimals(tx: Tx, orgId: string): Promise<SponsorAnimal[]> {
  const r = await tx.execute(sql`
    select a.*, f.name as fund_name, (select count(*) from gifts g where g.sponsor_animal_id = a.id and g.gift_type <> 'refund')::int as gift_count
      from sponsor_animals a left join funds f on f.id = a.fund_id
     where a.org_id = ${orgId} order by a.sort_order, a.name`);
  return r.map((x) => map(x as Record<string, unknown>));
}

async function canManage(tx: Tx, orgId: string): Promise<boolean> {
  const r = await tx.execute(sql`select app.has_role(${orgId}, '{owner,admin}') as ok`);
  return Boolean((r[0] as { ok: boolean }).ok);
}

/** The photo must sit in this organization's own folder of the branding bucket. */
const photoOk = (orgId: string, path: string | null | undefined) => !path || path.startsWith(`${orgId}/`);

export type AnimalResult = { ok: true; id: string } | { ok: false; reason: "forbidden" | "not_found" | "bad_photo" | "bad_fund" | "has_gifts" };

export async function saveAnimal(tx: Tx, orgId: string, id: string | null, a: SponsorAnimalInput): Promise<AnimalResult> {
  if (!(await canManage(tx, orgId))) return { ok: false, reason: "forbidden" };
  if (!photoOk(orgId, a.photoPath)) return { ok: false, reason: "bad_photo" };
  if (a.fundId && !(await tx.execute(sql`select 1 from funds where id = ${a.fundId} and org_id = ${orgId}`)).length) return { ok: false, reason: "bad_fund" };
  const r = id
    ? await tx.execute(sql`
        update sponsor_animals set name = ${a.name}, description = ${a.description ?? null}, photo_path = ${a.photoPath ?? null}, fund_id = ${a.fundId ?? null},
               active = ${a.active}, sort_order = ${a.sortOrder}
         where id = ${id} and org_id = ${orgId} returning id`)
    : await tx.execute(sql`
        insert into sponsor_animals (org_id, name, description, photo_path, fund_id, active, sort_order)
        values (${orgId}, ${a.name}, ${a.description ?? null}, ${a.photoPath ?? null}, ${a.fundId ?? null}, ${a.active}, ${a.sortOrder})
        returning id`);
  if (!r.length) return { ok: false, reason: "not_found" };
  return { ok: true, id: (r[0] as { id: string }).id };
}

export async function deleteAnimal(tx: Tx, orgId: string, id: string): Promise<AnimalResult> {
  if (!(await canManage(tx, orgId))) return { ok: false, reason: "forbidden" };
  const used = await tx.execute(sql`
    select (exists (select 1 from gifts where org_id = ${orgId} and sponsor_animal_id = ${id})
         or exists (select 1 from recurring_plans where org_id = ${orgId} and sponsor_animal_id = ${id})) as used`);
  if ((used[0] as { used: boolean }).used) return { ok: false, reason: "has_gifts" };
  const r = await tx.execute(sql`delete from sponsor_animals where id = ${id} and org_id = ${orgId} returning id`);
  if (!r.length) return { ok: false, reason: "not_found" };
  // Take it off any giving page that offered it.
  await tx.execute(sql`update donation_pages set animal_ids = array_remove(animal_ids, ${id}::uuid) where org_id = ${orgId} and ${id}::uuid = any(animal_ids)`);
  return { ok: true, id };
}

/** The tribute on one gift, for the gift's page. Null when there is none or it is not visible. */
export type GiftTribute = { kind: "honor" | "memory"; honoreeName: string; notifyName: string | null; notifyEmail: string | null; notifiedAt: string | null };

export async function getGiftTribute(tx: Tx, orgId: string, giftId: string): Promise<GiftTribute | null> {
  const r = await tx.execute(sql`select kind, honoree_name, notify_name, notify_email, notified_at from gift_tributes where org_id = ${orgId} and gift_id = ${giftId}`);
  if (!r.length) return null;
  const x = r[0] as Record<string, unknown>;
  return {
    kind: x.kind as GiftTribute["kind"],
    honoreeName: x.honoree_name as string,
    notifyName: (x.notify_name as string | null) ?? null,
    notifyEmail: (x.notify_email as string | null) ?? null,
    notifiedAt: x.notified_at ? new Date(x.notified_at as string).toISOString() : null,
  };
}
