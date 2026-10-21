"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { US_TIMEZONES } from "@maple/core";
import type { OrgDetail } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, Button, FormField, Input, Select } from "@/components/ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The organization's own details. The EIN and mailing address go on every thank-you letter and
 * year-end statement. Used by the setup walkthrough and by Settings, Organization details.
 */
export function ProfileForm({ org, submitLabel, onSaved, extraActions }: { org: OrgDetail; submitLabel: string; onSaved: () => void; extraActions?: ReactNode }) {
  const [name, setName] = useState(org.name);
  const [ein, setEin] = useState(org.ein ?? "");
  const [line1, setLine1] = useState(org.address.line1 ?? "");
  const [line2, setLine2] = useState(org.address.line2 ?? "");
  const [city, setCity] = useState(org.address.city ?? "");
  const [state, setState] = useState(org.address.state ?? "");
  const [postalCode, setPostalCode] = useState(org.address.postalCode ?? "");
  const [month, setMonth] = useState(org.fiscalYearStartMonth);
  const [timezone, setTimezone] = useState(US_TIMEZONES.some((t) => t.id === org.timezone) ? org.timezone : "America/New_York");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setFormError(null);
    const res = await api().api.v1.orgs[":orgId"].$patch({
      param: { orgId: org.id },
      json: { name, ein, address: { line1, line2, city, state, postalCode }, fiscalYearStartMonth: month, timezone },
    });
    setPending(false);
    if (!res.ok) {
      const body = (await res.clone().json().catch(() => null)) as { issues?: { path: string; message: string }[] } | null;
      if (body?.issues?.length) {
        // "address.postalCode" becomes "postalCode" so each message lands on its field.
        return setErrors(Object.fromEntries(body.issues.map((i) => [i.path.split(".").pop() ?? i.path, i.message])));
      }
      return setFormError(await errorMessage(res));
    }
    onSaved();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {formError && (
        <Alert variant="error">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FormField id="org-name" label="Organization name" required error={errors.name}>
        {(f) => <Input {...f} autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} />}
      </FormField>
      <FormField id="org-ein" label="EIN (federal tax ID)" optional error={errors.ein} help="Nine digits, on your IRS determination letter. Donors need it for their taxes. Leave blank if you do not have one yet.">
        {(f) => <Input {...f} inputMode="numeric" placeholder="12-3456789" value={ein} onChange={(e) => setEin(e.target.value)} className="sm:max-w-60" />}
      </FormField>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-30 font-semibold">Mailing address</legend>
        <p className="-mt-1 text-20 leading-4 text-text-weak">Printed on thank-you letters and year-end statements.</p>
        <FormField id="org-line1" label="Street" required error={errors.line1}>
          {(f) => <Input {...f} autoComplete="address-line1" value={line1} onChange={(e) => setLine1(e.target.value)} />}
        </FormField>
        <FormField id="org-line2" label="Suite or PO box" optional error={errors.line2}>
          {(f) => <Input {...f} autoComplete="address-line2" value={line2} onChange={(e) => setLine2(e.target.value)} />}
        </FormField>
        <div className="grid gap-3 sm:grid-cols-[1fr_6rem_8rem]">
          <FormField id="org-city" label="City" error={errors.city}>
            {(f) => <Input {...f} autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} />}
          </FormField>
          <FormField id="org-state" label="State" error={errors.state}>
            {(f) => <Input {...f} autoComplete="address-level1" maxLength={2} value={state} onChange={(e) => setState(e.target.value.toUpperCase())} />}
          </FormField>
          <FormField id="org-zip" label="ZIP code" error={errors.postalCode}>
            {(f) => <Input {...f} autoComplete="postal-code" inputMode="numeric" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />}
          </FormField>
        </div>
      </fieldset>
      <FormField
        id="org-fy"
        label="Your fiscal year starts in"
        help="The month your books start each year. Most nonprofits use January or July; your treasurer or your Form 990 will say. On your dashboards, &quot;this year&quot; counts from this month."
      >
        {(f) => (
          <Select {...f} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="sm:max-w-60">
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField id="org-tz" label="Time zone" help="Used for gift dates and the nightly dashboard update.">
        {(f) => (
          <Select {...f} value={timezone} onChange={(e) => setTimezone(e.target.value)} className="sm:max-w-60">
            {US_TIMEZONES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending} disabled={name.trim().length < 2 || !line1.trim()}>
          {submitLabel}
        </Button>
        {extraActions}
      </div>
    </form>
  );
}
