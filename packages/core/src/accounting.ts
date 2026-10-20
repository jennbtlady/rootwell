import { toCsv } from "./csv";

/**
 * QuickBooks Online export. One journal entry per posted batch:
 *   Debit  the bank (deposit account)      what reached the bank
 *   Debit  processing fees (fee account)   platform fees, when any
 *   Credit each fund's income account      the gifts, gross
 * Debits equal credits for every entry. In-kind gifts, soft credits, and pledges are left
 * out because no money moved.
 */
export type ExportBatch = {
  batchId: string;
  batchDate: string;
  description: string | null;
  gifts: { amount: string; fee: string | null; fundName: string | null; incomeAccount: string | null }[];
};
export type AccountNames = { depositAccount: string; feeAccount: string; defaultIncomeAccount: string };

export const DEFAULT_ACCOUNTS: AccountNames = { depositAccount: "Checking", feeAccount: "Bank and payment fees", defaultIncomeAccount: "Contributions" };

const toCents = (s: string | null) => (s == null ? 0 : Math.round(Number(s) * 100));
const dollars = (c: number) => (c / 100).toFixed(2);
/** QuickBooks US imports read MM/DD/YYYY. */
const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

export type JournalLine = { journalNo: string; date: string; account: string; debit: number; credit: number; description: string };

export function journalLines(batches: ExportBatch[], accounts: AccountNames): JournalLine[] {
  const out: JournalLine[] = [];
  batches.forEach((b, i) => {
    if (!b.gifts.length) return;
    const no = `ML-${b.batchDate.replace(/-/g, "")}-${i + 1}`;
    const desc = b.description?.trim() || "Gift deposit";
    const gross = b.gifts.reduce((s, g) => s + toCents(g.amount), 0);
    const fees = b.gifts.reduce((s, g) => s + toCents(g.fee), 0);
    const byAccount = new Map<string, number>();
    for (const g of b.gifts) {
      const acct = g.incomeAccount?.trim() || accounts.defaultIncomeAccount;
      byAccount.set(acct, (byAccount.get(acct) ?? 0) + toCents(g.amount));
    }
    out.push({ journalNo: no, date: b.batchDate, account: accounts.depositAccount, debit: gross - fees, credit: 0, description: desc });
    if (fees) out.push({ journalNo: no, date: b.batchDate, account: accounts.feeAccount, debit: fees, credit: 0, description: `${desc}: processing fees` });
    for (const [acct, amt] of [...byAccount.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
      out.push({ journalNo: no, date: b.batchDate, account: acct, debit: 0, credit: amt, description: desc });
    }
  });
  return out;
}

export function journalCsv(lines: JournalLine[]): string {
  return toCsv(
    [
      { key: "no", label: "Journal No" },
      { key: "date", label: "Journal Date" },
      { key: "account", label: "Account" },
      { key: "debit", label: "Debits" },
      { key: "credit", label: "Credits" },
      { key: "description", label: "Description" },
      { key: "name", label: "Name" },
    ],
    lines.map((l) => ({ no: l.journalNo, date: usDate(l.date), account: l.account, debit: l.debit ? dollars(l.debit) : "", credit: l.credit ? dollars(l.credit) : "", description: l.description, name: "" })),
  );
}

export function depositSummaryCsv(batches: ExportBatch[]): string {
  return toCsv(
    [
      { key: "date", label: "Date" },
      { key: "description", label: "Batch" },
      { key: "count", label: "Gifts" },
      { key: "gross", label: "Gifts total" },
      { key: "fees", label: "Fees" },
      { key: "net", label: "Deposit" },
    ],
    batches
      .filter((b) => b.gifts.length)
      .map((b) => {
        const gross = b.gifts.reduce((s, g) => s + toCents(g.amount), 0);
        const fees = b.gifts.reduce((s, g) => s + toCents(g.fee), 0);
        return { date: usDate(b.batchDate), description: b.description ?? "", count: b.gifts.length, gross: dollars(gross), fees: dollars(fees), net: dollars(gross - fees) };
      }),
  );
}
