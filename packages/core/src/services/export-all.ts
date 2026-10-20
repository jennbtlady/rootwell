import { sql } from "drizzle-orm";
import type { Tx } from "./types";
import { toCsv } from "../csv";

/**
 * Everything an organization owns, one spreadsheet per table, for the continuity promise:
 * exports always work, even when the account is read only. Ids are kept so the files can
 * be joined back together (a gift's constituent_id is a row in constituents.csv).
 */
export const EXPORT_TABLES = [
  "constituents",
  "constituent_emails",
  "constituent_phones",
  "constituent_addresses",
  "relationships",
  "interactions",
  "tags",
  "constituent_tags",
  "funds",
  "campaigns",
  "appeals",
  "batches",
  "gifts",
  "recurring_plans",
  "pledges",
  "acknowledgments",
  "acknowledgment_templates",
  "donation_pages",
] as const;

const README = `What is in this download

One spreadsheet (CSV file) per kind of record. Open them in Excel, Google Sheets, or Numbers.

Each row has an id. Other files point to it. For example, in gifts.csv the column
constituent_id matches the id column in constituents.csv, and fund_id matches funds.csv.

constituents.csv          People, households, and organizations
constituent_emails.csv    Their email addresses
constituent_phones.csv    Their phone numbers
constituent_addresses.csv Their mailing addresses
relationships.csv         Who is related to whom
interactions.csv          Calls, meetings, and notes
tags.csv, constituent_tags.csv   Tags and who has them
funds.csv, campaigns.csv, appeals.csv   How gifts are coded
batches.csv               Deposits
gifts.csv                 Every gift, with amounts, dates, and coding
recurring_plans.csv       Monthly gifts
pledges.csv               Promised gifts
acknowledgments.csv       Thank-yous sent
acknowledgment_templates.csv   Your letter and email templates
donation_pages.csv        Your online giving pages
organization.csv          Your organization's settings
`;

export async function exportEverything(tx: Tx, orgId: string): Promise<{ files: Record<string, string>; counts: Record<string, number> } | null> {
  const org = await tx.execute(sql`
    select id, name, ein, address, fiscal_year_start_month, timezone, gift_entry_standards, accounting, created_at
      from organizations where id = ${orgId}`);
  if (!org.length) return null;
  const files: Record<string, string> = { "README.txt": README };
  const counts: Record<string, number> = {};
  files["organization.csv"] = csvOf(org as Record<string, unknown>[]);
  for (const t of EXPORT_TABLES) {
    const rows = (await tx.execute(sql`select * from ${sql.identifier(t)} where org_id = ${orgId} order by created_at`)) as Record<string, unknown>[];
    counts[t] = rows.length;
    files[`${t}.csv`] = csvOf(rows);
  }
  return { files, counts };
}

function csvOf(rows: Record<string, unknown>[]): string {
  if (!rows.length) return toCsv([{ key: "none", label: "(no rows)" }], []);
  const keys = Object.keys(rows[0]!);
  const cell = (v: unknown) => (v == null ? "" : v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : v);
  return toCsv(
    keys.map((k) => ({ key: k, label: k })),
    rows.map((r) => Object.fromEntries(keys.map((k) => [k, cell(r[k])]))),
  );
}

/** Owners and admins download everything. It holds every donor's contact details. */
export async function canExportEverything(tx: Tx, orgId: string): Promise<boolean> {
  const r = await tx.execute(sql`select app.has_role(${orgId}, '{owner,admin}') as ok`);
  return Boolean((r[0] as { ok: boolean }).ok);
}
