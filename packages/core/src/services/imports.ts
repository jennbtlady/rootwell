import { sql } from "drizzle-orm";
import { CODING_FIELDS, mapRow, normalizeRow, suggestCoding, type CodingField, type FieldValues, type ImportField, type ImportKind } from "../import";
import type { ImportOptions } from "../schemas/coding";
import { listCoding } from "./coding";
import type { Tx } from "./types";

export type ImportStatus = "uploading" | "ready" | "committed" | "rolled_back";
export type RowAction = "create" | "match" | "review" | "skip" | "error";

export type ImportJob = {
  id: string;
  kind: ImportKind;
  fileName: string;
  headers: string[];
  expectedRows: number;
  uploadedRows: number;
  status: ImportStatus;
  mapping: Partial<Record<ImportField, string>>;
  batchId: string | null;
  summary: Record<string, unknown>;
  options: Partial<ImportOptions>;
  counts: Record<RowAction, number>;
  people: Record<RowAction, number>;
  /** Rows that will become gifts (create or match, with a gift). */
  giftRows: number;
  createdAt: string;
  committedAt: string | null;
  rolledBackAt: string | null;
  createdByName: string | null;
};

function mapJob(r: Record<string, unknown>): ImportJob {
  const counts = { create: 0, match: 0, review: 0, skip: 0, error: 0, ...((r.counts as Record<string, number>) ?? {}) };
  const people = { create: 0, match: 0, review: 0, skip: 0, error: 0, ...((r.people as Record<string, number>) ?? {}) };
  return {
    id: r.id as string,
    kind: r.kind as ImportKind,
    fileName: r.file_name as string,
    headers: r.headers as string[],
    expectedRows: Number(r.expected_rows),
    uploadedRows: Number(r.uploaded_rows ?? 0),
    status: r.status as ImportStatus,
    mapping: (r.mapping as ImportJob["mapping"]) ?? {},
    batchId: (r.batch_id as string | null) ?? null,
    summary: (r.summary as Record<string, unknown>) ?? {},
    options: (r.options as Partial<ImportOptions>) ?? {},
    counts,
    people,
    giftRows: Number(r.gift_rows ?? 0),
    createdAt: String(r.created_at),
    committedAt: r.committed_at == null ? null : String(r.committed_at),
    rolledBackAt: r.rolled_back_at == null ? null : String(r.rolled_back_at),
    createdByName: (r.created_by_name as string | null) ?? null,
  };
}

const jobSelect = sql`
  j.*, coalesce(p.full_name, p.email) as created_by_name,
  (select count(*) from import_rows r where r.job_id = j.id) as uploaded_rows,
  (select coalesce(jsonb_object_agg(action, n), '{}') from (select action, count(*) as n from import_rows r where r.job_id = j.id group by action) x) as counts,
  (select coalesce(jsonb_object_agg(action, n), '{}') from (select action, count(distinct coalesce(person_key, row_number::text)) as n from import_rows r where r.job_id = j.id group by action) x) as people,
  (select count(*) from import_rows r where r.job_id = j.id and r.action in ('create', 'match') and jsonb_typeof(r.mapped->'gift') = 'object') as gift_rows
  from import_jobs j left join profiles p on p.id = j.created_by
`;

export async function listImportJobs(tx: Tx, orgId: string): Promise<ImportJob[]> {
  const rows = await tx.execute(sql`select ${jobSelect} where j.org_id = ${orgId} order by j.created_at desc limit 100`);
  return rows.map((r) => mapJob(r as Record<string, unknown>));
}

export async function getImportJob(tx: Tx, orgId: string, id: string): Promise<ImportJob | null> {
  const rows = await tx.execute(sql`select ${jobSelect} where j.org_id = ${orgId} and j.id = ${id}`);
  return rows[0] ? mapJob(rows[0] as Record<string, unknown>) : null;
}

export async function createImportJob(tx: Tx, orgId: string, input: { kind: ImportKind; fileName: string; headers: string[]; expectedRows: number }): Promise<{ id: string }> {
  const r = await tx.execute(sql`
    insert into import_jobs (org_id, kind, file_name, headers, expected_rows)
    values (${orgId}, ${input.kind}::import_kind, ${input.fileName}, ${sql`array[${sql.join(input.headers.map((h) => sql`${h}`), sql`, `)}]::text[]`}, ${input.expectedRows})
    returning id`);
  return { id: (r[0] as { id: string }).id };
}

/** Appends a chunk of raw rows. Row numbers are 1-based positions after the header row. */
export async function appendImportRows(tx: Tx, orgId: string, jobId: string, offset: number, rows: string[][]): Promise<number> {
  const job = await getImportJob(tx, orgId, jobId);
  if (!job || job.status !== "uploading") return -1;
  const payload = JSON.stringify(rows.map((r, i) => ({ n: offset + i + 1, r: r.map((c) => (c == null ? "" : String(c))) })));
  await tx.execute(sql`
    insert into import_rows (org_id, job_id, row_number, raw)
    select ${orgId}, ${jobId}, (x->>'n')::int, array(select jsonb_array_elements_text(x->'r'))
      from jsonb_array_elements(${payload}::jsonb) x
    on conflict (job_id, row_number) do update set raw = excluded.raw`);
  const c = await tx.execute(sql`select count(*)::int as n from import_rows where job_id = ${jobId}`);
  return Number((c[0] as { n: number }).n);
}

/** Maps and validates every row, then matches people. Can be run again with a new mapping. */
export async function prepareImport(tx: Tx, orgId: string, jobId: string, mapping: Partial<Record<ImportField, string>>): Promise<ImportJob | null> {
  const job = await getImportJob(tx, orgId, jobId);
  if (!job || (job.status !== "uploading" && job.status !== "ready")) return null;
  if (job.uploadedRows < job.expectedRows) throw Object.assign(new Error("The file has not finished uploading"), { code: "22023" });
  const raw = await tx.execute(sql`select row_number, raw from import_rows where job_id = ${jobId} order by row_number`);
  const today = new Date();
  const updates = raw.map((r) => {
    const x = r as { row_number: number; raw: string[] };
    const m = mapRow(x.raw, job.headers, mapping, job.kind, today);
    return { n: x.row_number, fields: m.fields, mapped: m.mapped, errors: m.errors, warnings: m.warnings, key: m.personKey, action: m.errors.length ? "error" : "create" };
  });
  await tx.execute(sql`
    update import_rows r
       set fields = x.fields, mapped = x.mapped, errors = x.errors, warnings = x.warnings, person_key = x.key,
           action = x.action::import_row_action, candidates = '[]', match_constituent_id = null
      from jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) as x(n int, fields jsonb, mapped jsonb, errors jsonb, warnings jsonb, key text, action text)
     where r.job_id = ${jobId} and r.row_number = x.n`);
  await tx.execute(sql`update import_jobs set mapping = ${JSON.stringify(mapping)}::jsonb, status = 'ready' where id = ${jobId}`);
  await tx.execute(sql`select app.match_import(${jobId})`);
  return getImportJob(tx, orgId, jobId);
}

export type ImportRowView = {
  rowNumber: number;
  raw: string[];
  fields: FieldValues;
  errors: { field: string; message: string }[];
  warnings: { field: string; message: string }[];
  action: RowAction;
  personKey: string | null;
};

export async function listImportRows(tx: Tx, orgId: string, jobId: string, opts: { action?: RowAction; withWarnings?: boolean; limit?: number; offset?: number } = {}): Promise<{ items: ImportRowView[]; total: number }> {
  const where = opts.action ? sql`and action = ${opts.action}::import_row_action` : opts.withWarnings ? sql`and jsonb_array_length(warnings) > 0` : sql``;
  const rows = await tx.execute(sql`
    select row_number, raw, fields, errors, warnings, action, person_key, count(*) over() as total
      from import_rows where job_id = ${jobId} and org_id = ${orgId} ${where}
     order by row_number limit ${opts.limit ?? 50} offset ${opts.offset ?? 0}`);
  return {
    items: rows.map((r) => {
      const x = r as Record<string, unknown>;
      return { rowNumber: Number(x.row_number), raw: x.raw as string[], fields: x.fields as FieldValues, errors: x.errors as ImportRowView["errors"], warnings: x.warnings as ImportRowView["warnings"], action: x.action as RowAction, personKey: (x.person_key as string | null) ?? null };
    }),
    total: Number((rows[0] as { total?: number } | undefined)?.total ?? 0),
  };
}

/** Edits a row's field values, re-validates it, and re-matches its person. */
export async function fixImportRow(tx: Tx, orgId: string, jobId: string, rowNumber: number, patch: FieldValues): Promise<ImportRowView | null> {
  const job = await getImportJob(tx, orgId, jobId);
  if (!job || job.status !== "ready") return null;
  const cur = await tx.execute(sql`select fields from import_rows where job_id = ${jobId} and row_number = ${rowNumber}`);
  if (!cur[0]) return null;
  const fields = { ...((cur[0] as { fields: FieldValues }).fields ?? {}), ...patch };
  const n = normalizeRow(fields, job.kind);
  await tx.execute(sql`
    update import_rows set fields = ${JSON.stringify(fields)}::jsonb, mapped = ${JSON.stringify(n.mapped)}::jsonb, errors = ${JSON.stringify(n.errors)}::jsonb,
           warnings = ${JSON.stringify(n.warnings)}::jsonb, person_key = ${n.personKey}, action = ${n.errors.length ? "error" : "create"}::import_row_action,
           candidates = '[]', match_constituent_id = null
     where job_id = ${jobId} and row_number = ${rowNumber}`);
  if (!n.errors.length && n.personKey) await tx.execute(sql`select app.match_import(${jobId}, ${n.personKey})`);
  const after = await tx.execute(sql`select row_number, raw, fields, errors, warnings, action, person_key from import_rows where job_id = ${jobId} and row_number = ${rowNumber}`);
  const x = after[0] as Record<string, unknown>;
  return { rowNumber, raw: x.raw as string[], fields: x.fields as FieldValues, errors: x.errors as ImportRowView["errors"], warnings: x.warnings as ImportRowView["warnings"], action: x.action as RowAction, personKey: (x.person_key as string | null) ?? null };
}

export async function skipImportRow(tx: Tx, orgId: string, jobId: string, rowNumber: number, skip: boolean): Promise<boolean> {
  const r = skip
    ? await tx.execute(sql`update import_rows set action = 'skip' where job_id = ${jobId} and org_id = ${orgId} and row_number = ${rowNumber}`)
    : await tx.execute(sql`update import_rows set action = case when jsonb_array_length(errors) > 0 then 'error'::import_row_action else 'create'::import_row_action end where job_id = ${jobId} and org_id = ${orgId} and row_number = ${rowNumber} and action = 'skip'`);
  if (!skip) {
    const k = await tx.execute(sql`select person_key, action from import_rows where job_id = ${jobId} and row_number = ${rowNumber}`);
    const row = k[0] as { person_key: string | null; action: string } | undefined;
    if (row?.person_key && row.action === "create") await tx.execute(sql`select app.match_import(${jobId}, ${row.person_key})`);
  }
  return r.count > 0;
}

export type ReviewPerson = {
  personKey: string;
  firstRow: number;
  rowCount: number;
  giftTotal: string;
  action: RowAction;
  matchId: string | null;
  person: Record<string, unknown>;
  candidates: { id: string; displayName: string; score: number; reasons: string[]; details?: CandidateDetails }[];
};

/** What the existing record holds, so the person can compare it with the row in the file. */
export type CandidateDetails = { email: string | null; phone: string | null; address: string | null; giftCount: number; lastGift: string | null };

/** People in the file, grouped. `scope` "review" shows only open decisions. */
export async function listImportPeople(tx: Tx, orgId: string, jobId: string, scope: "review" | "match" | "create" | "skip", limit = 50, offset = 0): Promise<{ items: ReviewPerson[]; total: number }> {
  const rows = await tx.execute(sql`
    with g as (
      select person_key, min(row_number) as first_row, count(*) as row_count,
             coalesce(sum((mapped->'gift'->>'amount')::numeric), 0) as gift_total,
             (array_agg(action order by row_number))[1] as action,
             (array_agg(match_constituent_id order by row_number))[1] as match_id,
             (array_agg(mapped->'person' order by row_number))[1] as person,
             (array_agg(candidates order by row_number))[1] as candidates
        from import_rows where job_id = ${jobId} and org_id = ${orgId} and person_key is not null and action = ${scope}::import_row_action
       group by person_key)
    select *, count(*) over() as total from g order by first_row limit ${limit} offset ${offset}`);
  const items: ReviewPerson[] = rows.map((r) => {
    const x = r as Record<string, unknown>;
    return { personKey: x.person_key as string, firstRow: Number(x.first_row), rowCount: Number(x.row_count), giftTotal: String(x.gift_total), action: x.action as RowAction, matchId: (x.match_id as string | null) ?? null, person: (x.person as Record<string, unknown>) ?? {}, candidates: (x.candidates as ReviewPerson["candidates"]) ?? [] };
  });
  const ids = [...new Set(items.flatMap((p) => p.candidates.map((c) => c.id)))];
  if (ids.length) {
    const found = await tx.execute(sql`
      select c.id,
             (select e.email from constituent_emails e where e.constituent_id = c.id order by e.is_primary desc limit 1) as email,
             (select p.phone from constituent_phones p where p.constituent_id = c.id order by p.is_primary desc limit 1) as phone,
             (select concat_ws(', ', nullif(a.line1, ''), nullif(a.city, ''), nullif(a.postal_code, '')) from constituent_addresses a where a.constituent_id = c.id order by a.is_primary desc limit 1) as address,
             (select count(*) from gifts g where g.constituent_id = c.id)::int as gift_count,
             (select max(g.gift_date)::text from gifts g where g.constituent_id = c.id) as last_gift
        from constituents c where c.org_id = ${orgId} and c.id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`);
    const byId = new Map(found.map((f) => {
      const d = f as Record<string, unknown>;
      return [d.id as string, { email: (d.email as string) ?? null, phone: (d.phone as string) ?? null, address: (d.address as string) || null, giftCount: Number(d.gift_count), lastGift: (d.last_gift as string) ?? null }];
    }));
    for (const p of items) for (const c of p.candidates) c.details = byId.get(c.id);
  }
  return { items, total: Number((rows[0] as { total?: number } | undefined)?.total ?? 0) };
}

/** Sets the decision for every row of one person. */
export async function decidePerson(tx: Tx, orgId: string, jobId: string, personKey: string, action: "create" | "match" | "skip", matchId: string | null): Promise<boolean> {
  if (action === "match") {
    const ok = await tx.execute(sql`select 1 from constituents where id = ${matchId} and org_id = ${orgId}`);
    if (!ok[0]) return false;
  }
  const r = await tx.execute(sql`
    update import_rows set action = ${action}::import_row_action, match_constituent_id = ${action === "match" ? matchId : null}
     where job_id = ${jobId} and org_id = ${orgId} and person_key = ${personKey} and action <> 'error'`);
  return r.count > 0;
}

/** Applies one decision to every person still waiting for review. */
export async function decideAllReview(tx: Tx, orgId: string, jobId: string, action: "create" | "skip" | "best_match"): Promise<number> {
  const r =
    action === "best_match"
      ? await tx.execute(sql`update import_rows set action = 'match', match_constituent_id = (candidates->0->>'id')::uuid where job_id = ${jobId} and org_id = ${orgId} and action = 'review' and jsonb_array_length(candidates) > 0`)
      : await tx.execute(sql`update import_rows set action = ${action}::import_row_action, match_constituent_id = null where job_id = ${jobId} and org_id = ${orgId} and action = 'review'`);
  return r.count;
}

export async function skipAllErrors(tx: Tx, orgId: string, jobId: string): Promise<number> {
  const r = await tx.execute(sql`update import_rows set action = 'skip' where job_id = ${jobId} and org_id = ${orgId} and action = 'error'`);
  return r.count;
}

export type ImportCodingValue = { field: CodingField; value: string; rows: number; choice: string; how: "exact" | "similar" | "none" | "chosen" };
export type ImportCoding = { values: ImportCodingValue[]; existing: Record<CodingField, { id: string; name: string }[]> };

/**
 * The fund, campaign and appeal names in the file, each with what it will become: an
 * existing one (by name, by a close match, or by the person's earlier choice) or a new one.
 */
export async function listImportCoding(tx: Tx, orgId: string, jobId: string): Promise<ImportCoding | null> {
  const job = await getImportJob(tx, orgId, jobId);
  if (!job) return null;
  const vals = await tx.execute(sql`
    select k as field, trim(mapped->'gift'->>k) as value, count(*)::int as rows
      from import_rows, unnest(array['fund', 'campaign', 'appeal']) k
     where job_id = ${jobId} and org_id = ${orgId} and action in ('create', 'match') and coalesce(trim(mapped->'gift'->>k), '') <> ''
     group by 1, 2 order by 1, 3 desc`);
  const lists = await Promise.all((["funds", "campaigns", "appeals"] as const).map((k) => listCoding(tx, k, orgId, { includeInactive: true })));
  const existing = Object.fromEntries(CODING_FIELDS.map((f, i) => [f, lists[i]!.map((c) => ({ id: c.id, name: c.name, code: c.code ?? null }))])) as Record<CodingField, { id: string; name: string; code: string | null }[]>;
  const saved = job.options.coding ?? { fund: {}, campaign: {}, appeal: {} };
  const values = vals.map((r) => {
    const x = r as { field: CodingField; value: string; rows: number };
    const chosen = saved[x.field]?.[x.value];
    if (chosen) return { ...x, choice: chosen, how: "chosen" as const };
    const s = suggestCoding(x.value, existing[x.field]);
    return { ...x, choice: s.id ?? "new", how: s.how };
  });
  return { values, existing: Object.fromEntries(CODING_FIELDS.map((f) => [f, existing[f].map(({ id, name }) => ({ id, name }))])) as ImportCoding["existing"] };
}

/** Saves the choices from the last step, then runs the import. */
export async function commitImport(tx: Tx, jobId: string, options?: ImportOptions): Promise<Record<string, unknown>> {
  if (options) await tx.execute(sql`update import_jobs set options = ${JSON.stringify(options)}::jsonb where id = ${jobId}`);
  const r = await tx.execute(sql`select app.commit_import(${jobId}) as s`);
  // Imported gifts change the totals; recompute the dashboard now (see postBatch).
  await tx.execute(sql`select app.refresh_dashboard(j.org_id) from import_jobs j where j.id = ${jobId}`);
  return (r[0] as { s: Record<string, unknown> }).s;
}

export async function rollbackImport(tx: Tx, jobId: string): Promise<Record<string, unknown>> {
  const r = await tx.execute(sql`select app.rollback_import(${jobId}) as s`);
  await tx.execute(sql`select app.refresh_dashboard(j.org_id) from import_jobs j where j.id = ${jobId}`);
  return (r[0] as { s: Record<string, unknown> }).s;
}

export async function deleteImportJob(tx: Tx, orgId: string, jobId: string): Promise<boolean> {
  const r = await tx.execute(sql`delete from import_jobs where id = ${jobId} and org_id = ${orgId} and status in ('uploading', 'ready')`);
  return r.count > 0;
}

// ---- saved mappings
export type SavedMapping = { id: string; name: string; kind: ImportKind; headers: string[]; mapping: Partial<Record<ImportField, string>> };

export async function listSavedMappings(tx: Tx, orgId: string): Promise<SavedMapping[]> {
  const rows = await tx.execute(sql`select id, name, kind, headers, mapping from import_mappings where org_id = ${orgId} order by name`);
  return rows.map((r) => r as SavedMapping);
}

export async function saveMapping(tx: Tx, orgId: string, input: { name: string; kind: ImportKind; headers: string[]; mapping: Partial<Record<ImportField, string>> }): Promise<{ id: string }> {
  const r = await tx.execute(sql`
    insert into import_mappings (org_id, name, kind, headers, mapping)
    values (${orgId}, ${input.name}, ${input.kind}::import_kind, ${sql`array[${sql.join(input.headers.map((h) => sql`${h}`), sql`, `)}]::text[]`}, ${JSON.stringify(input.mapping)}::jsonb)
    on conflict (org_id, name) do update set kind = excluded.kind, headers = excluded.headers, mapping = excluded.mapping
    returning id`);
  return { id: (r[0] as { id: string }).id };
}
