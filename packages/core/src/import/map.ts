import { fieldsFor, type ImportField, type ImportKind } from "./fields";
import { parseAmount, parseDate, parseEmail, parsePaymentMethod, parsePhone, parseType, parseYesNo, splitName } from "./parse";

export type FieldValues = Partial<Record<ImportField, string>>;
export type RowIssue = { field: ImportField | "row"; message: string };

export type MappedPerson = {
  type: "person" | "household" | "organization";
  prefix: string | null;
  first_name: string | null;
  last_name: string | null;
  suffix: string | null;
  preferred_name: string | null;
  org_name: string | null;
  email: string | null;
  phone: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  tags: string[];
  source: string | null;
  notes: string | null;
  do_not_contact: boolean;
  do_not_email: boolean;
  do_not_mail: boolean;
  do_not_call: boolean;
  legacy_id: string | null;
};

export type MappedGift = {
  amount: string;
  gift_date: string;
  fund: string | null;
  campaign: string | null;
  appeal: string | null;
  payment_method: string;
  check_number: string | null;
  reference: string | null;
  notes: string | null;
};

export type MappedRow = {
  fields: FieldValues;
  mapped: { person: MappedPerson; gift: MappedGift | null } | null;
  errors: RowIssue[];
  warnings: RowIssue[];
  personKey: string | null;
};

/** Pulls the mapped columns out of a raw row. */
export function extractFields(raw: string[], headers: string[], mapping: Partial<Record<ImportField, string>>): FieldValues {
  const index = new Map(headers.map((h, i) => [h, i]));
  const out: FieldValues = {};
  for (const [field, header] of Object.entries(mapping) as [ImportField, string][]) {
    const i = index.get(header);
    if (i !== undefined) out[field] = (raw[i] ?? "").toString();
  }
  return out;
}

const text = (v: string | undefined, max = 200) => {
  const s = (v ?? "").trim().replace(/\s+/g, " ");
  return s ? s.slice(0, max) : null;
};

/** Normalizes one row's field values. The same function runs after a fix in place. */
export function normalizeRow(fields: FieldValues, kind: ImportKind, today = new Date()): Omit<MappedRow, "fields"> {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const allowed = new Set(fieldsFor(kind));
  const f = (k: ImportField) => (allowed.has(k) ? fields[k] : undefined);

  let first = text(f("first_name"), 80);
  let last = text(f("last_name"), 80);
  let prefix = text(f("prefix"), 20);
  let suffix = text(f("suffix"), 20);
  const full = text(f("full_name"), 200);
  if (full && !first && !last) {
    const n = splitName(full);
    first = n.first;
    last = n.last;
    prefix = prefix ?? n.prefix;
    suffix = suffix ?? n.suffix;
  }
  const orgName = text(f("org_name"), 200);
  let type = parseType(f("type") ?? "") ?? (first || last ? "person" : orgName ? "organization" : "person");
  if (type !== "person" && !orgName) {
    if (first || last) type = "person";
  }
  if (type === "person" && !first && !last) {
    if (orgName) type = "organization";
    else errors.push({ field: "last_name", message: "Each row needs a name: a first or last name, a full name, or an organization" });
  }

  const email = parseEmail(f("email") ?? "");
  if (!email.ok) errors.push({ field: "email", message: email.error });
  const phone = parsePhone(f("phone") ?? "");
  if (phone.warning) warnings.push({ field: "phone", message: phone.warning });
  let state = text(f("state"), 50);
  if (state && /^[a-z]{2}$/i.test(state)) state = state.toUpperCase();
  const yes = (k: ImportField) => {
    const v = parseYesNo(f(k) ?? "");
    if (v === null && (f(k) ?? "").trim()) warnings.push({ field: k, message: `"${f(k)!.trim()}" is not yes or no, so it was left as no` });
    return v ?? false;
  };

  const person: MappedPerson = {
    type,
    prefix,
    first_name: first,
    last_name: last,
    suffix,
    preferred_name: text(f("preferred_name"), 80),
    org_name: type === "person" ? null : orgName,
    email: email.ok ? email.value : null,
    phone: phone.value,
    line1: text(f("line1")),
    line2: text(f("line2")),
    city: text(f("city"), 100),
    state,
    postal_code: text(f("postal_code"), 20),
    country: (() => {
      const c = text(f("country"), 60);
      if (!c) return null;
      if (/^(us|usa|united states|united states of america|u\.s\.a?\.?)$/i.test(c)) return "US";
      return c.length === 2 ? c.toUpperCase() : c.slice(0, 2).toUpperCase();
    })(),
    tags: (f("tags") ?? "").split(/[,;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 20),
    source: text(f("source"), 100),
    notes: text(f("notes"), 5000),
    do_not_contact: yes("do_not_contact"),
    do_not_email: yes("do_not_email"),
    do_not_mail: yes("do_not_mail"),
    do_not_call: yes("do_not_call"),
    legacy_id: text(f("legacy_id"), 100),
  };
  // Organizations sometimes arrive with a person's name as the contact; keep the person.
  if (type === "person" && orgName && (first || last)) person.org_name = null;

  let gift: MappedGift | null = null;
  if (kind === "constituents_gifts") {
    const giftFields: ImportField[] = ["amount", "gift_date", "fund", "campaign", "appeal", "payment_method", "check_number", "reference", "gift_notes"];
    const any = giftFields.some((k) => (fields[k] ?? "").trim());
    if (any) {
      const amount = parseAmount(fields.amount ?? "");
      if (!amount.ok) errors.push({ field: "amount", message: amount.error });
      const date = parseDate(fields.gift_date ?? "", today);
      if (!date.ok) errors.push({ field: "gift_date", message: date.error });
      const pm = parsePaymentMethod(fields.payment_method ?? "");
      if (pm.warning) warnings.push({ field: "payment_method", message: pm.warning });
      if (amount.ok && date.ok) {
        gift = {
          amount: amount.value,
          gift_date: date.value,
          fund: text(fields.fund, 120),
          campaign: text(fields.campaign, 120),
          appeal: text(fields.appeal, 120),
          payment_method: pm.value,
          check_number: text(fields.check_number, 30),
          reference: text(fields.reference, 100),
          notes: text(fields.gift_notes, 2000),
        };
      }
    }
  }

  const mapped = errors.length ? null : { person, gift };
  return { mapped, errors, warnings, personKey: personKey(person) };
}

/**
 * Rows that describe the same person share a key: the old system's id, else the email,
 * else name and ZIP, else name. Keys are lower-cased and trimmed.
 */
export function personKey(p: Pick<MappedPerson, "legacy_id" | "email" | "first_name" | "last_name" | "org_name" | "postal_code">): string | null {
  if (p.legacy_id) return `id:${p.legacy_id.toLowerCase()}`;
  if (p.email) return `email:${p.email}`;
  const name = [p.first_name, p.last_name, p.org_name].filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  const zip = (p.postal_code ?? "").replace(/\s/g, "").slice(0, 5);
  return zip ? `name:${name}|${zip}` : `name:${name}`;
}

export function mapRow(raw: string[], headers: string[], mapping: Partial<Record<ImportField, string>>, kind: ImportKind, today = new Date()): MappedRow {
  const fields = extractFields(raw, headers, mapping);
  return { fields, ...normalizeRow(fields, kind, today) };
}
