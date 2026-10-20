"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, Button, FormField, Input, Select } from "@/components/ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export function NewOrgForm() {
  const router = useRouter();
  const guessedZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/New_York";
  const [name, setName] = useState("");
  const [month, setMonth] = useState(1);
  const [timezone, setTimezone] = useState(TIMEZONES.includes(guessedZone) ? guessedZone : "America/New_York");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await api().api.v1.orgs.$post({ json: { name, fiscalYearStartMonth: month, timezone } });
    setPending(false);
    if (res.status === 201) {
      const { id } = await res.json();
      router.push(`/app/orgs/${id}`);
      router.refresh();
      return;
    }
    setError(await errorMessage(res));
  }

  const zones = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField id="name" label="Organization name" required>
        {(f) => <Input {...f} name="name" required autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} />}
      </FormField>
      <FormField id="month" label="Fiscal year starts in" help="Many nonprofits start in July. If you are not sure, leave January.">
        {(f) => (
          <Select {...f} name="month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField id="timezone" label="Time zone">
        {(f) => (
          <Select {...f} name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace("_", " ")}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      <div aria-live="polite">
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <Button type="submit" loading={pending} disabled={name.trim().length < 2}>
        Create organization
      </Button>
    </form>
  );
}
