"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { grossUpForFee } from "@maple/core";
import { Alert, AlertDescription, Button, Card, Checkbox, FormField, Input, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useEarlyTyping } from "@/lib/early-typing";

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 });

export function GiveForm({ slug, amounts, funds, allowMonthly, offerCoverFees }: { slug: string; amounts: number[]; funds: { id: string; name: string }[]; allowMonthly: boolean; offerCoverFees: boolean }) {
  const [choice, setChoice] = useState<string>(String(amounts[1] ?? amounts[0] ?? ""));
  const [other, setOther] = useState("");
  const [monthly, setMonthly] = useState(false);
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [cover, setCover] = useState(offerCoverFees);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const name = useId();
  const form = useRef<HTMLFormElement>(null);
  // An amount tapped before the page's scripts loaded is the amount given.
  useEarlyTyping(form, (field, value, checked) => {
    if (field === `${name}-freq`) setMonthly(value === "monthly");
    if (field === `${name}-amt`) setChoice(value);
    if (field === `${name}-other`) setOther(value);
    if (field === `${name}-fund`) setFundId(value);
    if (field === `${name}-cover`) setCover(checked);
  });

  const dollars = choice === "other" ? Number(other.replace(/[$,\s]/g, "")) : Number(choice);
  const valid = Number.isFinite(dollars) && dollars >= 1 && dollars <= 100000;
  const giftCents = valid ? Math.round(dollars * 100) : 0;
  const totalCents = valid && cover && offerCoverFees ? grossUpForFee(giftCents) : giftCents;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return setError("Enter an amount between $1 and $100,000.");
    setPending(true);
    setError(null);
    const res = await fetch(`/api/v1/public/give/${slug}/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: dollars, monthly: allowMonthly && monthly, fundId: fundId || null, coverFee: cover && offerCoverFees }),
    });
    if (!res.ok) {
      setPending(false);
      const body = (await res.json().catch(() => null)) as { error?: string; issues?: { message: string }[] } | null;
      return setError(body?.issues?.[0]?.message ?? body?.error ?? "Something went wrong. Please try again.");
    }
    window.location.assign(((await res.json()) as { url: string }).url);
  }

  const pill = (checked: boolean) =>
    cn(
      "flex min-h-11 cursor-pointer items-center justify-center rounded-30 border px-3 text-40 font-semibold has-[:focus-visible]:shadow-focus",
      checked ? "border-border-primary bg-background-primary-weakest text-text-primary" : "border-border-weak bg-background-body text-text hover:border-border-primary",
    );

  return (
    <Card>
      <form ref={form} method="post" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {allowMonthly && (
          <fieldset>
            <legend className="mb-2 text-30 font-semibold">How often</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: false, l: "One time" },
                { v: true, l: "Every month" },
              ].map((o) => (
                <label key={o.l} className={pill(monthly === o.v)}>
                  <input type="radio" className="sr-only" name={`${name}-freq`} value={o.v ? "monthly" : "once"} checked={monthly === o.v} onChange={() => setMonthly(o.v)} />
                  {o.l}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend className="mb-2 text-30 font-semibold">Amount</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {amounts.map((a) => (
              <label key={a} className={pill(choice === String(a))}>
                <input type="radio" className="sr-only" name={`${name}-amt`} value={a} checked={choice === String(a)} onChange={() => setChoice(String(a))} />
                {usd(a * 100)}
              </label>
            ))}
            <label className={pill(choice === "other")}>
              <input type="radio" className="sr-only" name={`${name}-amt`} value="other" checked={choice === "other"} onChange={() => setChoice("other")} />
              Other
            </label>
          </div>
        </fieldset>
        {choice === "other" && (
          <FormField id={`${name}-other`} label="Your amount" required>
            {(f) => <Input {...f} inputMode="decimal" insertBefore="$" autoFocus name={`${name}-other`} value={other} onChange={(e) => setOther(e.target.value)} />}
          </FormField>
        )}
        {funds.length > 1 && (
          <FormField id={`${name}-fund`} label="Where your gift goes">
            {(f) => (
              <Select {...f} name={`${name}-fund`} value={fundId} onChange={(e) => setFundId(e.target.value)}>
                {funds.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}
        {offerCoverFees && (
          <Checkbox
            label={valid ? `Add ${usd(grossUpForFee(giftCents) - giftCents)} to cover the card fee` : "Add a little to cover the card fee"}
            help="So all of your gift reaches us."
            name={`${name}-cover`}
            checked={cover}
            onChange={(e) => setCover(e.target.checked)}
          />
        )}
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="default" fullWidth loading={pending} disabled={!valid}>
          {valid ? `Give ${usd(totalCents)}${allowMonthly && monthly ? " a month" : ""}` : "Give"}
        </Button>
      </form>
    </Card>
  );
}
