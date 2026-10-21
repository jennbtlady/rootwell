"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { accessToken, api, errorMessage } from "@/lib/api";
import { saveResponse } from "@/lib/download";
import { formatDate, formatMoney, plural } from "@/lib/format";
import { Alert, AlertDescription, Badge, Button, EmptyState, FormField, Select, Table, TBody, TD, TH, THead, TR, useToast, useConfirm } from "@/components/ui";

type Row = { constituentId: string; name: string; email: string | null; doNotEmail: boolean; hasAddress: boolean; gifts: number; total: string; deductibleTotal: string; emailedAt: string | null; printedAt: string | null };

export function StatementsPanel({ orgId, year, donors, missingEin }: { orgId: string; year: number; donors: Row[]; missingEin: boolean }) {
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const thisYear = new Date().getFullYear();
  const byEmail = donors.filter((d) => d.email && !d.doNotEmail);
  const notYetEmailed = byEmail.filter((d) => !d.emailedAt);
  const byMail = donors.filter((d) => !d.email || d.doNotEmail);
  const printed = byMail.filter((d) => d.printedAt);
  const lastEmailed = byEmail.map((d) => d.emailedAt).filter(Boolean).sort().at(-1) ?? null;
  const total = donors.reduce((s, d) => s + Number(d.total), 0);

  async function pdf(only?: "to_print") {
    setBusy(only ?? "pdf");
    const res = await fetch(`/api/v1/orgs/${orgId}/statements/${year}/pdf`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${(await accessToken()) ?? ""}` },
      body: JSON.stringify(only ? { only } : {}),
    });
    setBusy(null);
    if (!res.ok) return toast({ type: "error", title: "The statements were not made", description: await errorMessage(res) });
    await saveResponse(res, only ? `${year}-statements-to-print.pdf` : `${year}-giving-statements.pdf`);
    if (only) router.refresh();
  }

  async function email(resend = false) {
    const n = resend ? byEmail.length : notYetEmailed.length;
    const question = resend
      ? `Send ${year} statements again to all ${plural(n, "donor")} with email? Everyone gets a second copy.`
      : `Email ${plural(n, `${year} statement`)}? Each donor gets their own PDF. Donors already emailed are not sent another.`;
    if (!await confirm({ title: resend ? "Send everyone a second copy?" : `Email ${plural(n, `${year} statement`)}?`, body: question, confirmLabel: resend ? "Send again" : "Email statements" })) return;
    setBusy(resend ? "resend" : "email");
    const res = await api().api.v1.orgs[":orgId"].statements[":year"].email.$post({ param: { orgId, year: String(year) }, json: { resend } });
    setBusy(null);
    if (!res.ok) return toast({ type: "error", title: "No statements were sent", description: await errorMessage(res) });
    const r = (await res.json()) as { sent: number; failed: number; firstError: string | null };
    toast({ type: r.failed ? "error" : "success", title: `${r.sent} ${r.sent === 1 ? "statement" : "statements"} sent${r.failed ? `, ${r.failed} failed` : ""}`, description: r.firstError ?? undefined });
    router.refresh();
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
        {notYetEmailed.length > 0 ? (
          <Button loading={busy === "email"} disabled={busy !== null} onClick={() => email()}>
            Email {notYetEmailed.length} not yet sent
          </Button>
        ) : (
          byEmail.length > 0 && <Badge variant="success">Everyone with email has theirs</Badge>
        )}
        {byMail.length > 0 && (
          <Button variant="secondary" loading={busy === "to_print"} disabled={busy !== null} onClick={() => pdf("to_print")}>
            Download the {byMail.length} to print
          </Button>
        )}
        <Button variant="link" size="small" loading={busy === "pdf"} disabled={!donors.length || busy !== null} onClick={() => pdf()}>
          Download all as one PDF
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
            {plural(donors.length, "donor")} gave {formatMoney(total)} in {year}. {byEmail.length > 0 && `Emailed: ${byEmail.length - notYetEmailed.length} of ${byEmail.length}${lastEmailed ? ` (last on ${formatDate(lastEmailed)})` : ""}.`}{" "}
            {byMail.length > 0 && `By mail: ${printed.length} of ${byMail.length} printed.`}
          </p>
          {byEmail.length > 0 && notYetEmailed.length === 0 && (
            <p className="text-30">
              <Button variant="link" size="small" loading={busy === "resend"} disabled={busy !== null} onClick={() => email(true)}>
                Send everyone a second copy
              </Button>
            </p>
          )}
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
                  <TD>
                    {d.emailedAt && d.email && !d.doNotEmail ? (
                      <Badge variant="success">Emailed {formatDate(d.emailedAt)}</Badge>
                    ) : d.printedAt && (!d.email || d.doNotEmail) ? (
                      <Badge variant="success">Printed {formatDate(d.printedAt)}</Badge>
                    ) : d.email && !d.doNotEmail ? (
                      <Badge variant="neutral">Email, not sent</Badge>
                    ) : d.hasAddress ? (
                      <Badge>Print and mail</Badge>
                    ) : (
                      <Badge variant="warning">No email or address</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}
    </div>
  );
}
