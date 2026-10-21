"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GIFT_FIELD_LABEL, GIFT_TYPES, GIFT_TYPE_LABEL, PAYMENT_METHODS, PAYMENT_METHOD_LABEL, requiredGiftFields, type GiftEntryStandards, type GiftField } from "@maple/core";
import type { Batch, CodingRow, Gift } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle, Button, Combobox, EmptyState, FormField, Input, Select, Table, TBody, TD, Textarea, TH, THead, TR, useToast, type ComboboxItem } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";

type Props = {
  orgId: string;
  batch: Batch & { gifts: Gift[] };
  standards: GiftEntryStandards;
  funds: CodingRow[];
  campaigns: CodingRow[];
  appeals: CodingRow[];
  canPost: boolean;
  preselected: ComboboxItem | null;
};

export function BatchWorkspace({ orgId, batch, standards, funds, campaigns, appeals, canPost, preselected }: Props) {
  const router = useRouter();
  const toast = useToast();
  const open = batch.status === "open";
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  async function post() {
    const expected = batch.expectedTotal != null ? ` The deposit slip says ${formatMoney(batch.expectedTotal)}.` : "";
    if (!window.confirm(`Post ${batch.giftCount} gifts totaling ${formatMoney(batch.giftTotal)}?${expected} Posted gifts cannot be changed.`)) return;
    setPosting(true);
    setPostError(null);
    const res = await api().api.v1.orgs[":orgId"].batches[":id"].post.$post({ param: { orgId, id: batch.id } });
    setPosting(false);
    if (!res.ok) return setPostError(await errorMessage(res));
    const { postedCount, postedTotal } = (await res.json()) as { postedCount: number; postedTotal: string };
    toast({ type: "success", title: "Batch posted", description: `${postedCount} gifts totaling ${formatMoney(postedTotal)} are now locked.` });
    router.refresh();
  }

  async function removeGift(g: Gift) {
    if (!window.confirm(`Remove the ${formatMoney(g.amount)} gift from ${g.constituentName}?`)) return;
    const res = await api().api.v1.orgs[":orgId"].gifts[":id"].$delete({ param: { orgId, id: g.id } });
    if (res.status === 204) {
      toast({ title: "Gift removed", description: `${formatMoney(g.amount)} from ${g.constituentName}.` });
      router.refresh();
    } else toast({ type: "error", title: "Could not remove the gift", description: await errorMessage(res) });
  }

  return (
    <div className="flex flex-col gap-6">
      {open && <GiftEntryForm orgId={orgId} batch={batch} standards={standards} funds={funds} campaigns={campaigns} appeals={appeals} preselected={preselected} />}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-40 font-semibold tracking-[-0.02em]">Gifts in this batch</h2>
          {open && canPost && batch.giftCount > 0 && (
            <Button onClick={post} loading={posting}>
              Post batch
            </Button>
          )}
        </div>
        {postError && (
          <Alert variant="error">
            <AlertTitle>The batch was not posted</AlertTitle>
            <AlertDescription>{postError}</AlertDescription>
          </Alert>
        )}
        {batch.gifts.length === 0 ? (
          <EmptyState title="No gifts yet">Enter the first gift above.</EmptyState>
        ) : (
          <Table label="Gifts in this batch">
            <THead>
              <TR>
                <TH>Donor</TH>
                <TH align="right">Amount</TH>
                <TH>Date</TH>
                <TH>Fund</TH>
                <TH>Campaign</TH>
                <TH>Method</TH>
                {open && <TH />}
              </TR>
            </THead>
            <TBody>
              {batch.gifts.map((g) => (
                <TR key={g.id}>
                  <TD>
                    <Link href={`/app/orgs/${orgId}/constituents/${g.constituentId}`} className={anchorClass + " font-medium"}>
                      {g.constituentName}
                    </Link>
                  </TD>
                  <TD align="right">{formatMoney(g.amount)}</TD>
                  <TD className="text-text-weak">{formatDate(g.giftDate)}</TD>
                  <TD>{g.fundName ?? ""}</TD>
                  <TD className="text-text-weak">{g.campaignName ?? ""}</TD>
                  <TD className="text-text-weak">
                    {PAYMENT_METHOD_LABEL[g.paymentMethod as keyof typeof PAYMENT_METHOD_LABEL] ?? g.paymentMethod}
                    {g.checkNumber ? ` #${g.checkNumber}` : ""}
                  </TD>
                  {open && (
                    <TD align="right">
                      <Button variant="destructive_link" size="small" onClick={() => removeGift(g)}>
                        Remove
                      </Button>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function GiftEntryForm({ orgId, batch, standards, funds, campaigns, appeals, preselected }: Omit<Props, "canPost">) {
  const router = useRouter();
  const required = requiredGiftFields(standards);
  const hint = (f: GiftField) => standards.fieldInstructions[f];
  const [donor, setDonor] = useState<ComboboxItem | null>(preselected);
  const [results, setResults] = useState<ComboboxItem[]>([]);
  const [amount, setAmount] = useState("");
  const [giftDate, setGiftDate] = useState(batch.batchDate);
  const [fundId, setFundId] = useState(standards.defaultFundId ?? funds[0]?.id ?? "");
  const [campaignId, setCampaignId] = useState(standards.defaultCampaignId && campaigns.some((c) => c.id === standards.defaultCampaignId) ? standards.defaultCampaignId : "");
  const [appealId, setAppealId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>("check");
  const [giftType, setGiftType] = useState<(typeof GIFT_TYPES)[number]>("one_time");
  const [checkNumber, setCheckNumber] = useState("");
  const [reference, setReference] = useState("");
  const [fmv, setFmv] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const donorRef = useRef<HTMLInputElement>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (preselected) amountRef.current?.focus();
  }, [preselected]);

  async function search(q: string) {
    const seq = ++searchSeq.current;
    if (!q.trim()) return setResults([]);
    const res = await api().api.v1.orgs[":orgId"].constituents.$get({ param: { orgId }, query: { q, limit: "8" } });
    if (!res.ok || seq !== searchSeq.current) return;
    const { items } = (await res.json()) as { items: { id: string; displayName: string; primaryEmail: string | null; city: string | null }[] };
    setResults(items.map((i) => ({ id: i.id, label: i.displayName, detail: [i.primaryEmail, i.city].filter(Boolean).join(" · ") || null })));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLastSaved(null);
    if (!donor) return setFieldErrors({ constituentId: "Choose who gave this gift" });
    setPending(true);
    const res = await api().api.v1.orgs[":orgId"].gifts.$post({
      param: { orgId },
      json: {
        constituentId: donor.id, batchId: batch.id, amount, giftDate, fundId: fundId || null, campaignId: campaignId || null, appealId: appealId || null,
        paymentMethod, giftType, checkNumber: checkNumber || null, reference: reference || null, fairMarketValue: fmv || null, notes: notes || null,
      },
    });
    setPending(false);
    if (res.status === 400) {
      const body = (await res.json()) as { issues?: { path: string; message: string }[]; error?: string };
      const fe: Record<string, string> = {};
      for (const i of body.issues ?? []) fe[i.path] = i.message;
      setFieldErrors(fe);
      setError(body.issues?.length ? "Please fix the highlighted fields." : (body.error ?? "Please check the form."));
      return;
    }
    if (!res.ok) return setError(await errorMessage(res));
    setLastSaved(`${formatMoney(amount)} from ${donor.label} saved.`);
    // Keep date, fund, campaign, appeal and method for the next gift in the pile; clear the rest.
    setDonor(null);
    setAmount("");
    setCheckNumber("");
    setReference("");
    setFmv("");
    setNotes("");
    setResults([]);
    donorRef.current?.focus();
    router.refresh();
  }

  const fe = (k: string) => fieldErrors[k];
  const isCheck = paymentMethod === "check";
  const isInKind = giftType === "in_kind";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-30 border border-border-weaker bg-background-weakest p-4 sm:p-6" noValidate aria-labelledby="gift-entry-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="gift-entry-title" className="text-40 font-semibold tracking-[-0.02em]">
          Enter a gift
        </h2>
        <Link href={`/app/orgs/${orgId}/settings/gift-standards/print`} className={`${anchorClass} text-30`} target="_blank">
          Gift entry standards
        </Link>
      </div>

      {funds.length === 0 && (
        <Alert variant="warning">
          <AlertTitle>Add a fund before entering gifts</AlertTitle>
          <AlertDescription>
            Every gift goes into a fund, like General operating. You have none yet.{" "}
            <Link className="underline" href={`/app/orgs/${orgId}/setup?step=funds`}>
              Add your funds
            </Link>{" "}
            (it takes a minute), then come back.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="gift-donor" label={GIFT_FIELD_LABEL.constituentId} required error={fe("constituentId")} help={hint("constituentId")} className="sm:col-span-2">
          {(f) => (
            <Combobox
              id={f.id}
              inputRef={donorRef}
              items={results}
              value={donor}
              onChange={setDonor}
              onSearch={search}
              placeholder="Type a name, email or phone"
              emptyText="No one matches. Check the spelling before adding someone new."
              hasError={f.hasError}
              aria-describedby={f["aria-describedby"]}
              footer={
                <Link href={`/app/orgs/${orgId}/constituents/new`} className={`${anchorClass} text-30`}>
                  Add a new donor
                </Link>
              }
            />
          )}
        </FormField>
        <FormField id="gift-amount" label={GIFT_FIELD_LABEL.amount} required error={fe("amount")} help={hint("amount")}>
          {(f) => <Input {...f} ref={amountRef} inputMode="decimal" insertBefore="$" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </FormField>
        <FormField id="gift-date" label={GIFT_FIELD_LABEL.giftDate} required error={fe("giftDate")} help={hint("giftDate")}>
          {(f) => <Input {...f} type="date" value={giftDate} onChange={(e) => setGiftDate(e.target.value)} />}
        </FormField>
        <FormField id="gift-fund" label={GIFT_FIELD_LABEL.fundId} required error={fe("fundId")} help={hint("fundId")}>
          {(f) => (
            <Select {...f} value={fundId} onChange={(e) => setFundId(e.target.value)}>
              <option value="">Choose a fund</option>
              {funds.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField id="gift-campaign" label={GIFT_FIELD_LABEL.campaignId} required={required.has("campaignId")} optional={!required.has("campaignId")} error={fe("campaignId")} help={hint("campaignId")}>
          {(f) => (
            <Select {...f} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">None</option>
              {campaigns.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        {(appeals.length > 0 || required.has("appealId")) && (
          <FormField id="gift-appeal" label={GIFT_FIELD_LABEL.appealId} required={required.has("appealId")} optional={!required.has("appealId")} error={fe("appealId")} help={hint("appealId")}>
            {(f) => (
              <Select {...f} value={appealId} onChange={(e) => setAppealId(e.target.value)}>
                <option value="">None</option>
                {appeals.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}
        <FormField id="gift-method" label={GIFT_FIELD_LABEL.paymentMethod} required error={fe("paymentMethod")} help={hint("paymentMethod")}>
          {(f) => (
            <Select {...f} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        {isCheck && (
          <FormField id="gift-check" label={GIFT_FIELD_LABEL.checkNumber} required={standards.checkNumberForChecks || required.has("checkNumber")} error={fe("checkNumber")} help={hint("checkNumber")}>
            {(f) => <Input {...f} inputMode="numeric" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />}
          </FormField>
        )}
        <FormField id="gift-type" label={GIFT_FIELD_LABEL.giftType} required error={fe("giftType")} help={hint("giftType")}>
          {(f) => (
            <Select {...f} value={giftType} onChange={(e) => setGiftType(e.target.value as typeof giftType)}>
              {GIFT_TYPES.filter((t) => t !== "soft_credit" && t !== "pledge_payment" && t !== "recurring").map((t) => (
                <option key={t} value={t}>
                  {GIFT_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        {isInKind && (
          <FormField id="gift-fmv" label="Fair market value" required error={fe("fairMarketValue")} help="What the item would sell for. The deductible amount is the gift less this.">
            {(f) => <Input {...f} inputMode="decimal" insertBefore="$" value={fmv} onChange={(e) => setFmv(e.target.value)} />}
          </FormField>
        )}
        {(required.has("reference") || reference) && (
          <FormField id="gift-ref" label={GIFT_FIELD_LABEL.reference} required={required.has("reference")} error={fe("reference")} help={hint("reference")}>
            {(f) => <Input {...f} value={reference} onChange={(e) => setReference(e.target.value)} />}
          </FormField>
        )}
        <FormField id="gift-notes" label={GIFT_FIELD_LABEL.notes} required={required.has("notes")} optional={!required.has("notes")} error={fe("notes")} help={hint("notes")} className="sm:col-span-2">
          {(f) => <Textarea {...f} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </FormField>
      </div>

      <div aria-live="polite">
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {lastSaved && !error && (
          <Alert>
            <AlertDescription>{lastSaved}</AlertDescription>
          </Alert>
        )}
      </div>
      <div>
        <Button type="submit" loading={pending}>
          Save gift and add another
        </Button>
      </div>
    </form>
  );
}
