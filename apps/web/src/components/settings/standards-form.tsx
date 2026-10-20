"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_STANDARDS, GIFT_FIELDS, GIFT_FIELD_LABEL, OPTIONAL_GIFT_FIELDS, type GiftEntryStandards, type GiftField } from "@maple/core";
import type { CodingRow } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, Button, Checkbox, FormField, Input, Select, Textarea } from "@/components/ui";

export function StandardsForm({ orgId, standards = DEFAULT_STANDARDS, funds }: { orgId: string; standards?: GiftEntryStandards; funds: CodingRow[] }) {
  const router = useRouter();
  const [s, setS] = useState<GiftEntryStandards>(standards);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const required = new Set(s.requiredFields);

  function toggleRequired(f: (typeof OPTIONAL_GIFT_FIELDS)[number], on: boolean) {
    const next = new Set(required);
    if (on) next.add(f);
    else next.delete(f);
    setS({ ...s, requiredFields: [...next] });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const res = await api().api.v1.orgs[":orgId"]["gift-standards"].$put({ param: { orgId }, json: s });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-30 font-medium leading-5 text-text">Always required</legend>
        <p className="text-30 leading-5 text-text-weak">Donor, amount, date, fund, payment method and gift type. These cannot be turned off.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-30 font-medium leading-5 text-text">Also required here</legend>
        {OPTIONAL_GIFT_FIELDS.map((f) => (
          <Checkbox key={f} label={GIFT_FIELD_LABEL[f]} checked={required.has(f)} onChange={(e) => toggleRequired(f, e.target.checked)} />
        ))}
        <Checkbox label="Check number is required when the payment method is check" checked={s.checkNumberForChecks} onChange={(e) => setS({ ...s, checkNumberForChecks: e.target.checked })} />
      </fieldset>

      <FormField id="std-fund" label="Default fund" optional help="Filled in on every new gift. Staff can change it.">
        {(f) => (
          <Select {...f} value={s.defaultFundId ?? ""} onChange={(e) => setS({ ...s, defaultFundId: e.target.value || null })}>
            <option value="">No default</option>
            {funds.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-30 font-medium leading-5 text-text">Instructions shown under each field</legend>
        <p className="text-30 leading-5 text-text-weak">One or two sentences in your own words. Leave empty for no note.</p>
        {GIFT_FIELDS.map((f: GiftField) => (
          <FormField key={f} id={`std-ins-${f}`} label={GIFT_FIELD_LABEL[f]} optional>
            {(p) => <Input {...p} value={s.fieldInstructions[f] ?? ""} onChange={(e) => setS({ ...s, fieldInstructions: { ...s.fieldInstructions, [f]: e.target.value } })} />}
          </FormField>
        ))}
      </fieldset>

      <FormField id="std-conv" label="Other conventions" optional help="Printed on the standards page. How you name campaigns, what counts as a pledge, who reviews batches.">
        {(f) => <Textarea {...f} rows={6} value={s.conventions} onChange={(e) => setS({ ...s, conventions: e.target.value })} />}
      </FormField>

      <div aria-live="polite">
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {saved && !error && (
          <Alert>
            <AlertDescription>Saved. The gift form uses these from now on.</AlertDescription>
          </Alert>
        )}
      </div>
      <div>
        <Button type="submit" loading={pending}>
          Save standards
        </Button>
      </div>
    </form>
  );
}
