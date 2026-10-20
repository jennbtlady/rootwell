"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { accessToken, api, errorMessage } from "@/lib/api";
import { saveResponse } from "@/lib/download";
import { formatMoney } from "@/lib/format";
import { Alert, AlertDescription, Badge, Button, EmptyState, FormField, Select, Table, TBody, TD, TH, THead, TR, useToast } from "@/components/ui";

type Row = { constituentId: string; name: string; email: string | null; doNotEmail: boolean; hasAddress: boolean; gifts: number; total: string; deductibleTotal: string };

export function StatementsPanel({ orgId, year, donors, missingEin }: { orgId: string; year: number; donors: Row[]; missingEin: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const thisYear = new Date().getFullYear();
  const emailable = donors.filter((d) => d.email && !d.doNotEmail).length;
  const total = donors.reduce((s, d) => s + Number(d.total), 0);

  async function pdf() {
    setBusy("pdf");
    const res = await fetch(`/api/v1/orgs/${orgId}/statements/${year}/pdf`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${(await accessToken()) ?? ""}` }, body: "{}" });
    setBusy(null);
    if (!res.ok) return toast({ type: "error", title: "The statements were not made", description: await errorMessage(res) });
    await saveResponse(res, `${year}-giving-statements.pdf`);
  }

  async function email() {
    if (!window.confirm(`Email ${emailable} statements for ${year}? Each donor gets their own PDF. Donors with no email or who asked for no email are skipped; print theirs from the PDF.`)) return;
    setBusy("email");
    const res = await api().api.v1.orgs[":orgId"].statements[":year"].email.$post({ param: { orgId, year: String(year) }, json: {} });
    setBusy(null);
    if (!res.ok) return toast({ type: "error", title: "No statements were sent", description: await errorMessage(res) });
    const r = (await res.json()) as { sent: number; skipped: number; failed: number; firstError: string | null };
    toast({ type: r.failed ? "error" : "success", title: `${r.sent} statements sent${r.failed ? `, ${r.failed} failed` : ""}`, description: r.firstError ?? (r.skipped ? `${r.skipped} skipped` : undefined) });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <FormField id="st-year" label="Tax year">
          {(f) => (
            <Select {...f} value={year} onChange={(e) => router.push(`${path}?year=${e.target.value}`)}>
              {Array.from({ length: 6 }, (_, i) => thisYear - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button variant="secondary" loading={busy === "pdf"} disabled={!donors.length || busy !== null} onClick={pdf}>
          Download all as one PDF
        </Button>
        <Button loading={busy === "email"} disabled={!emailable || busy !== null} onClick={email}>
          Email {emailable} statements
        </Button>
      </div>
      {missingEin && (
        <Alert variant="warning">
          <AlertDescription>Add your organization&apos;s EIN before sending statements; donors need it for their records.</AlertDescription>
        </Alert>
      )}
      {donors.length === 0 ? (
        <EmptyState title={`No gifts in ${year}`} />
      ) : (
        <>
          <p className="text-30 text-text-weak">
            {donors.length.toLocaleString()} donors gave {formatMoney(total)} in {year}.
          </p>
          <Table label={`${year} statements`}>
            <THead>
              <TR>
                <TH>Donor</TH>
                <TH align="right">Gifts</TH>
                <TH align="right">Total</TH>
                <TH align="right">Deductible</TH>
                <TH>Delivery</TH>
              </TR>
            </THead>
            <TBody>
              {donors.map((d) => (
                <TR key={d.constituentId}>
                  <TD className="font-medium">{d.name}</TD>
                  <TD align="right">{d.gifts}</TD>
                  <TD align="right">{formatMoney(d.total)}</TD>
                  <TD align="right">{formatMoney(d.deductibleTotal)}</TD>
                  <TD>{d.email && !d.doNotEmail ? <Badge variant="neutral">Email</Badge> : d.hasAddress ? <Badge>Print and mail</Badge> : <Badge variant="warning">No email or address</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}
    </div>
  );
}
