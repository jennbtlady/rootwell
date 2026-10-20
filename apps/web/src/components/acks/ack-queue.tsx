"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AckTemplate, QueueItem } from "@maple/core/services";
import { accessToken, api, errorMessage } from "@/lib/api";
import { saveResponse } from "@/lib/download";
import { formatDate, formatMoney } from "@/lib/format";
import { Alert, AlertDescription, Badge, Button, EmptyState, FormField, Modal, Select, Table, TBody, TD, TH, THead, TR, useToast } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";

export function AckQueue({ orgId, items, total, templates }: { orgId: string; items: QueueItem[]; total: number; templates: AckTemplate[] }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ subject: string | null; body: string; signature: string | null; to: string } | null>(null);
  const emailTemplates = templates.filter((t) => t.channel === "email");
  const letterTemplates = templates.filter((t) => t.channel === "letter");
  const [emailTpl, setEmailTpl] = useState(emailTemplates[0]?.id ?? "");
  const [letterTpl, setLetterTpl] = useState(letterTemplates[0]?.id ?? "");
  const ids = useMemo(() => [...selected], [selected]);
  const chosen = items.filter((i) => selected.has(i.giftId));
  const emailable = chosen.filter((i) => i.email && !i.doNotEmail).length;

  function toggle(id: string, on: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  async function sendEmails() {
    if (!window.confirm(`Send ${emailable} thank-you email${emailable === 1 ? "" : "s"}? Donors with no email or who asked for no email are skipped.`)) return;
    setBusy("email");
    const res = await api().api.v1.orgs[":orgId"].acks.email.$post({ param: { orgId }, json: { giftIds: ids, templateId: emailTpl } });
    setBusy(null);
    if (!res.ok) return toast({ type: "error", title: "No emails were sent", description: await errorMessage(res) });
    const r = (await res.json()) as { sent: number; failed: number; skipped: number; firstError: string | null };
    toast({ type: r.failed ? "error" : "success", title: `${r.sent} sent${r.failed ? `, ${r.failed} failed` : ""}${r.skipped ? `, ${r.skipped} skipped` : ""}`, description: r.firstError ?? undefined });
    setSelected(new Set());
    router.refresh();
  }

  async function letters() {
    const mark = window.confirm("Mark these gifts as thanked by letter once the PDF downloads? Choose Cancel to download only.");
    setBusy("letter");
    const res = await fetch(`/api/v1/orgs/${orgId}/acks/letters`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${(await accessToken()) ?? ""}` },
      body: JSON.stringify({ giftIds: ids, templateId: letterTpl, markSent: mark }),
    });
    setBusy(null);
    if (!res.ok) return toast({ type: "error", title: "The letters were not made", description: await errorMessage(res) });
    await saveResponse(res, "thank-you-letters.pdf");
    if (mark) {
      setSelected(new Set());
      router.refresh();
    }
  }

  async function mark(method: "phone" | "in_person" | "letter" | "email") {
    setBusy(`mark-${method}`);
    const res = await api().api.v1.orgs[":orgId"].acks.mark.$post({ param: { orgId }, json: { giftIds: ids, method } });
    setBusy(null);
    if (!res.ok) return toast({ type: "error", title: "Could not mark them", description: await errorMessage(res) });
    toast({ type: "success", title: `${ids.length} marked as thanked` });
    setSelected(new Set());
    router.refresh();
  }

  async function showPreview(tplId: string) {
    const first = ids[0];
    if (!first) return;
    const res = await api().api.v1.orgs[":orgId"].acks.preview.$post({ param: { orgId }, json: { giftIds: [first], templateId: tplId } });
    if (!res.ok) return toast({ type: "error", title: "No preview", description: await errorMessage(res) });
    const d = (await res.json()) as { subject: string | null; body: string; signature: string | null; to: { name: string } };
    setPreview({ subject: d.subject, body: d.body, signature: d.signature, to: d.to.name });
  }

  if (items.length === 0) return <EmptyState title="Everyone has been thanked">New gifts appear here as soon as their batch is posted.</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-30 border border-border-weaker bg-background-weakest p-4 lg:flex-row lg:flex-wrap lg:items-end" aria-label="Actions for selected gifts" role="group">
        <div className="text-30 font-semibold leading-5 lg:w-full">
          {selected.size === 0 ? "Select gifts below to thank them." : `${selected.size} selected${emailable < selected.size ? `, ${emailable} can be emailed` : ""}`}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FormField id="email-tpl" label="Email template">
            {(f) => (
              <Select {...f} value={emailTpl} onChange={(e) => setEmailTpl(e.target.value)}>
                {emailTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <Button variant="link" size="small" disabled={!selected.size} onClick={() => showPreview(emailTpl)}>
            Preview
          </Button>
          <Button loading={busy === "email"} disabled={!emailable || busy !== null} onClick={sendEmails}>
            Send emails
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FormField id="letter-tpl" label="Letter template">
            {(f) => (
              <Select {...f} value={letterTpl} onChange={(e) => setLetterTpl(e.target.value)}>
                {letterTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <Button variant="link" size="small" disabled={!selected.size} onClick={() => showPreview(letterTpl)}>
            Preview
          </Button>
          <Button variant="secondary" loading={busy === "letter"} disabled={!selected.size || busy !== null} onClick={letters}>
            Download letters (PDF)
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="secondary" loading={busy === "mark-phone"} disabled={!selected.size || busy !== null} onClick={() => mark("phone")}>
            Thanked by phone
          </Button>
          <Button variant="secondary" loading={busy === "mark-in_person"} disabled={!selected.size || busy !== null} onClick={() => mark("in_person")}>
            Thanked in person
          </Button>
        </div>
      </div>

      <p className="text-30 text-text-weak">
        {total.toLocaleString()} gift{total === 1 ? "" : "s"} waiting{total > items.length ? `; the oldest ${items.length} are shown` : ""}.
      </p>
      <Table label="Gifts waiting for a thank-you">
        <THead>
          <TR>
            <TH>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-[var(--paste-color-background-primary)]" checked={selected.size === items.length} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.giftId)) : new Set())} />
                <span className="sr-only">Select all</span>
              </label>
            </TH>
            <TH>Donor</TH>
            <TH align="right">Amount</TH>
            <TH>Date</TH>
            <TH>Fund</TH>
            <TH>Reach by</TH>
            <TH align="right">Waiting</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((i) => (
            <TR key={i.giftId}>
              <TD>
                <input type="checkbox" aria-label={`Select ${formatMoney(i.amount)} from ${i.name}`} className="size-4 accent-[var(--paste-color-background-primary)]" checked={selected.has(i.giftId)} onChange={(e) => toggle(i.giftId, e.target.checked)} />
              </TD>
              <TD>
                <Link href={`/app/orgs/${orgId}/constituents/${i.constituentId}`} className={anchorClass + " font-medium"}>
                  {i.name}
                </Link>
              </TD>
              <TD align="right">{formatMoney(i.amount)}</TD>
              <TD className="text-text-weak">{formatDate(i.giftDate)}</TD>
              <TD className="text-text-weak">{i.fund ?? ""}</TD>
              <TD>
                <span className="flex flex-wrap gap-1">
                  {i.email && !i.doNotEmail ? <Badge variant="neutral">Email</Badge> : null}
                  {i.hasAddress && !i.doNotMail ? <Badge variant="neutral">Mail</Badge> : null}
                  {i.doNotEmail && i.doNotMail ? <Badge variant="warning">Do not contact</Badge> : null}
                  {!i.email && !i.hasAddress ? <Badge variant="warning">No email or address</Badge> : null}
                </span>
              </TD>
              <TD align="right" className={i.daysWaiting > 14 ? "font-semibold text-text-warning" : "text-text-weak"}>
                {i.daysWaiting} day{i.daysWaiting === 1 ? "" : "s"}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <Modal open={preview !== null} onOpenChange={(o) => !o && setPreview(null)} title={`Preview for ${preview?.to ?? ""}`}>
        {preview && (
          <div className="flex flex-col gap-3 text-30 leading-6">
            {preview.subject && (
              <p>
                <strong>Subject:</strong> {preview.subject}
              </p>
            )}
            <div className="whitespace-pre-wrap rounded-30 border border-border-weaker bg-background-weak p-4">
              {preview.body}
              {preview.signature ? `\n\n${preview.signature}` : ""}
            </div>
          </div>
        )}
      </Modal>
      {templates.some((t) => t.body.includes("(add your EIN")) && (
        <Alert variant="warning">
          <AlertDescription>Your organization has no EIN on file, so letters say &quot;(add your EIN in settings)&quot;.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
