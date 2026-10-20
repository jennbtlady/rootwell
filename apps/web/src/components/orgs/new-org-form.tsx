"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Organization name</Label>
        <Input id="name" name="name" required autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="month">Fiscal year starts in</Label>
        <select id="month" name="month" className="h-9 rounded-md border bg-background px-3 text-sm" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">Time zone</Label>
        <select id="timezone" name="timezone" className="h-9 rounded-md border bg-background px-3 text-sm" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <div aria-live="polite">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <Button type="submit" disabled={pending || name.trim().length < 2}>
        {pending ? "Creating..." : "Create organization"}
      </Button>
    </form>
  );
}
