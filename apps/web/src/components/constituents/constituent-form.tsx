"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ConstituentInput } from "@maple/core";
import type { Constituent, DuplicateCandidate } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { useEarlyTyping } from "@/lib/early-typing";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle, Button, Checkbox, FormField, Input, Radio, RadioGroup, Select, Textarea } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";

type Draft = {
  type: "person" | "household" | "organization";
  prefix: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  preferredName: string;
  orgName: string;
  email: string;
  emailType: string;
  phone: string;
  phoneType: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  doNotContact: boolean;
  doNotEmail: boolean;
  doNotMail: boolean;
  doNotCall: boolean;
  deceased: boolean;
  source: string;
  notes: string;
};

const EMPTY: Draft = {
  type: "person", prefix: "", firstName: "", middleName: "", lastName: "", suffix: "", preferredName: "", orgName: "",
  email: "", emailType: "home", phone: "", phoneType: "mobile", line1: "", line2: "", city: "", state: "", postalCode: "",
  doNotContact: false, doNotEmail: false, doNotMail: false, doNotCall: false, deceased: false, source: "", notes: "",
};

function fromConstituent(c: Constituent): Draft {
  const e = c.emails[0];
  const p = c.phones[0];
  const a = c.addresses[0];
  return {
    ...EMPTY,
    type: c.type, prefix: c.prefix ?? "", firstName: c.firstName ?? "", middleName: c.middleName ?? "", lastName: c.lastName ?? "", suffix: c.suffix ?? "",
    preferredName: c.preferredName ?? "", orgName: c.orgName ?? "", email: e?.email ?? "", emailType: e?.type ?? "home", phone: p?.phone ?? "", phoneType: p?.type ?? "mobile",
    line1: a?.line1 ?? "", line2: a?.line2 ?? "", city: a?.city ?? "", state: a?.state ?? "", postalCode: a?.postalCode ?? "",
    doNotContact: c.doNotContact, doNotEmail: c.doNotEmail, doNotMail: c.doNotMail, doNotCall: c.doNotCall, deceased: c.deceased, source: c.source ?? "", notes: c.notes ?? "",
  };
}

function toInput(d: Draft, existing: Constituent | null): ConstituentInput {
  const keepRest = <T extends { isPrimary: boolean }>(rows: T[]) => rows.slice(1);
  return {
    type: d.type,
    prefix: d.prefix || null, firstName: d.firstName || null, middleName: d.middleName || null, lastName: d.lastName || null, suffix: d.suffix || null,
    preferredName: d.preferredName || null, orgName: d.orgName || null,
    doNotContact: d.doNotContact, doNotEmail: d.doNotEmail, doNotMail: d.doNotMail, doNotCall: d.doNotCall, deceased: d.deceased, deceasedOn: null,
    source: d.source || null, assignedTo: null, notes: d.notes || null, customFields: existing?.customFields ?? {},
    // The form edits the primary contact points. Any extra ones an import added are kept.
    emails: [...(d.email ? [{ email: d.email, type: d.emailType as "home", isPrimary: true }] : []), ...keepRest(existing?.emails ?? []).map((e) => ({ email: e.email, type: e.type as "home", isPrimary: false }))],
    phones: [...(d.phone ? [{ phone: d.phone, type: d.phoneType as "mobile", isPrimary: true }] : []), ...keepRest(existing?.phones ?? []).map((p) => ({ phone: p.phone, type: p.type as "mobile", isPrimary: false }))],
    addresses: [
      ...(d.line1 || d.city || d.postalCode ? [{ line1: d.line1 || null, line2: d.line2 || null, city: d.city || null, state: d.state || null, postalCode: d.postalCode || null, country: "US", type: "home" as const, isPrimary: true }] : []),
      ...keepRest(existing?.addresses ?? []).map((a) => ({ line1: a.line1, line2: a.line2, city: a.city, state: a.state, postalCode: a.postalCode, country: a.country, type: a.type as "home", isPrimary: false })),
    ],
  };
}

/** "Ruth Goldberg" fills first and last name. One word is taken as the last name. */
function fromName(name: string): Draft {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return EMPTY;
  return { ...EMPTY, firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : "", lastName: parts[parts.length - 1]! };
}

/** A match this strong (same email, or same name and ZIP) needs a second look before saving. */
const STRONG = 0.9;

export function ConstituentForm({ orgId, existing, prefillName = "", returnToBatch = null }: { orgId: string; existing: Constituent | null; prefillName?: string; returnToBatch?: string | null }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(existing ? fromConstituent(existing) : fromName(prefillName));
  // The person has seen the strong match and said this is someone else.
  const [confirmedNew, setConfirmedNew] = useState(false);
  const [askDupe, setAskDupe] = useState<DuplicateCandidate | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dupes, setDupes] = useState<DuplicateCandidate[]>([]);
  const dupeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  // Each field is named after its key in the draft, so text typed before the page's
  // scripts loaded is copied in (and the duplicate check still sees it).
  useEarlyTyping(form, (name, value, checked) => {
    if (!(name in EMPTY)) return;
    const k = name as keyof Draft;
    setD((x) => {
      const v = typeof EMPTY[k] === "boolean" ? checked : k === "state" ? value.toUpperCase() : value;
      return x[k] === v ? x : { ...x, [k]: v };
    });
  });
  const base = `/app/orgs/${orgId}/constituents`;
  // Where a chosen donor goes: back to the batch being entered, or to their record.
  const destination = (id: string) => (returnToBatch ? `/app/orgs/${orgId}/batches/${returnToBatch}?constituent=${id}` : `${base}/${id}`);

  // Possible duplicates, checked as the person types. Runs only when creating.
  useEffect(() => {
    if (existing) return;
    const hasName = d.type === "person" ? d.lastName.trim().length >= 2 : d.orgName.trim().length >= 3;
    const enough = hasName || d.email.includes("@") || d.phone.replace(/\D/g, "").length >= 7;
    if (dupeTimer.current) clearTimeout(dupeTimer.current);
    dupeTimer.current = setTimeout(async () => {
      if (!enough) {
        setDupes([]);
        return;
      }
      const res = await api().api.v1.orgs[":orgId"].constituents.duplicates.$get({
        param: { orgId },
        query: { firstName: d.firstName || undefined, lastName: d.lastName || undefined, orgName: d.orgName || undefined, email: d.email || undefined, phone: d.phone || undefined, postalCode: d.postalCode || undefined },
      });
      if (res.ok) setDupes(((await res.json()) as { candidates: DuplicateCandidate[] }).candidates);
    }, 400);
    return () => {
      if (dupeTimer.current) clearTimeout(dupeTimer.current);
    };
  }, [d.firstName, d.lastName, d.orgName, d.email, d.phone, d.postalCode, d.type, existing, orgId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const strong = !existing && !confirmedNew ? dupes.find((c) => c.score >= STRONG) : undefined;
    if (strong) {
      setAskDupe(strong);
      return;
    }
    setAskDupe(null);
    setPending(true);
    const input = toInput(d, existing);
    const res = existing
      ? await api().api.v1.orgs[":orgId"].constituents[":id"].$patch({ param: { orgId, id: existing.id }, json: input })
      : await api().api.v1.orgs[":orgId"].constituents.$post({ param: { orgId }, json: input });
    setPending(false);
    if (res.status === 400) {
      const body = (await res.json()) as { issues?: { path: string; message: string }[] };
      const fe: Record<string, string> = {};
      for (const i of body.issues ?? []) fe[i.path.split(".")[0] ?? i.path] = i.message;
      setFieldErrors(fe);
      setError("Please fix the highlighted fields.");
      return;
    }
    if (!res.ok) return setError(await errorMessage(res));
    const id = existing ? existing.id : ((await res.json()) as { id: string }).id;
    router.push(destination(id));
    router.refresh();
  }

  const isPerson = d.type === "person";
  const fe = (k: string) => fieldErrors[k];

  return (
    <form ref={form} method="post" onSubmit={submit} className="flex max-w-2xl flex-col gap-6" noValidate>
      <RadioGroup legend="Type">
        <div className="flex flex-wrap gap-4">
          <Radio name="type" value="person" label="Person" checked={d.type === "person"} onChange={() => set("type", "person")} />
          <Radio name="type" value="household" label="Household" checked={d.type === "household"} onChange={() => set("type", "household")} />
          <Radio name="type" value="organization" label="Organization" checked={d.type === "organization"} onChange={() => set("type", "organization")} />
        </div>
      </RadioGroup>

      {isPerson ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="firstName" label="First name" error={fe("firstName")}>
            {(f) => <Input {...f} autoComplete="off" name="firstName" value={d.firstName} onChange={(e) => set("firstName", e.target.value)} />}
          </FormField>
          <FormField id="lastName" label="Last name" required error={fe("lastName")}>
            {(f) => <Input {...f} autoComplete="off" name="lastName" value={d.lastName} onChange={(e) => set("lastName", e.target.value)} />}
          </FormField>
          <FormField id="preferredName" label="Goes by" optional help="Used in letters and on screen instead of the first name.">
            {(f) => <Input {...f} autoComplete="off" name="preferredName" value={d.preferredName} onChange={(e) => set("preferredName", e.target.value)} />}
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="prefix" label="Prefix" optional>
              {(f) => <Input {...f} autoComplete="off" placeholder="Ms." name="prefix" value={d.prefix} onChange={(e) => set("prefix", e.target.value)} />}
            </FormField>
            <FormField id="suffix" label="Suffix" optional>
              {(f) => <Input {...f} autoComplete="off" placeholder="Jr." name="suffix" value={d.suffix} onChange={(e) => set("suffix", e.target.value)} />}
            </FormField>
          </div>
        </div>
      ) : (
        <FormField id="orgName" label={d.type === "household" ? "Household name" : "Organization name"} required error={fe("orgName")} help={d.type === "household" ? "For example, The Rivera Family." : undefined}>
          {(f) => <Input {...f} autoComplete="organization" name="orgName" value={d.orgName} onChange={(e) => set("orgName", e.target.value)} />}
        </FormField>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="email" label="Email" optional error={fe("emails")}>
          {(f) => <Input {...f} type="email" autoComplete="off" name="email" value={d.email} onChange={(e) => set("email", e.target.value)} />}
        </FormField>
        <FormField id="phone" label="Phone" optional error={fe("phones")}>
          {(f) => <Input {...f} type="tel" autoComplete="off" name="phone" value={d.phone} onChange={(e) => set("phone", e.target.value)} />}
        </FormField>
      </div>

      {/* Below the fields that trigger it, so the field being typed in does not jump down the page. */}
      {dupes.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>This might already be in your database</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 flex flex-col gap-1">
              {dupes.map((c) => (
                <li key={c.id}>
                  <Link href={destination(c.id)} className={anchorClass}>
                    {c.displayName}
                  </Link>{" "}
                  <span className="text-text-weak">({c.reasons.join(", ")})</span>
                </li>
              ))}
            </ul>
            <p className="mt-2">{returnToBatch ? "Choose the match to use it for this gift instead." : "Open the match to add to it instead."} If this is a different person, keep going.</p>
          </AlertDescription>
        </Alert>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-6">
        <legend className="mb-2 text-30 font-medium leading-5 text-text">Mailing address</legend>
        <FormField id="line1" label="Street" optional className="sm:col-span-6">
          {(f) => <Input {...f} autoComplete="off" name="line1" value={d.line1} onChange={(e) => set("line1", e.target.value)} />}
        </FormField>
        <FormField id="line2" label="Apartment, suite" optional className="sm:col-span-6">
          {(f) => <Input {...f} autoComplete="off" name="line2" value={d.line2} onChange={(e) => set("line2", e.target.value)} />}
        </FormField>
        <FormField id="city" label="City" optional className="sm:col-span-3">
          {(f) => <Input {...f} autoComplete="off" name="city" value={d.city} onChange={(e) => set("city", e.target.value)} />}
        </FormField>
        <FormField id="state" label="State" optional className="sm:col-span-1">
          {(f) => <Input {...f} autoComplete="off" maxLength={2} name="state" value={d.state} onChange={(e) => set("state", e.target.value.toUpperCase())} />}
        </FormField>
        <FormField id="postalCode" label="ZIP" optional className="sm:col-span-2">
          {(f) => <Input {...f} autoComplete="off" inputMode="numeric" name="postalCode" value={d.postalCode} onChange={(e) => set("postalCode", e.target.value)} />}
        </FormField>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-30 font-medium leading-5 text-text">Contact preferences</legend>
        <Checkbox label="Do not contact at all" name="doNotContact" checked={d.doNotContact} onChange={(e) => set("doNotContact", e.target.checked)} />
        <Checkbox label="No email" name="doNotEmail" checked={d.doNotEmail} onChange={(e) => set("doNotEmail", e.target.checked)} />
        <Checkbox label="No mail" name="doNotMail" checked={d.doNotMail} onChange={(e) => set("doNotMail", e.target.checked)} />
        <Checkbox label="No calls" name="doNotCall" checked={d.doNotCall} onChange={(e) => set("doNotCall", e.target.checked)} />
        {isPerson && <Checkbox label="Deceased" name="deceased" checked={d.deceased} onChange={(e) => set("deceased", e.target.checked)} />}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="source" label="How did they find you?" optional>
          {(f) => (
            <Select {...f} name="source" value={d.source} onChange={(e) => set("source", e.target.value)}>
              <option value="">Not sure</option>
              <option value="event">Event</option>
              <option value="mailing">Mailing</option>
              <option value="website">Website</option>
              <option value="referral">Referral</option>
              <option value="board">Board connection</option>
              <option value="import">Imported</option>
              <option value="other">Other</option>
            </Select>
          )}
        </FormField>
      </div>
      <FormField id="notes" label="Notes" optional>
        {(f) => <Textarea {...f} rows={3} name="notes" value={d.notes} onChange={(e) => set("notes", e.target.value)} />}
      </FormField>

      <div aria-live="polite">
        {askDupe && (
          <Alert variant="warning">
            <AlertTitle>Is this {askDupe.displayName}, who is already in your database?</AlertTitle>
            <AlertDescription>
              <p>They match on {askDupe.reasons.join(" and ")}. Adding them again makes a duplicate to clean up later.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={destination(askDupe.id)} className={buttonVariants({ size: "small" })}>
                  {returnToBatch ? `Use ${askDupe.displayName}` : `Open ${askDupe.displayName}`}
                </Link>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    setConfirmedNew(true);
                    setAskDupe(null);
                  }}
                >
                  No, this is someone else
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        {confirmedNew && !askDupe && !error && <p className="text-30 leading-5 text-text-weak">Got it. Choose {existing ? "Save changes" : "Add donor"} to save this as a new person.</p>}
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          {existing ? "Save changes" : "Add donor"}
        </Button>
        <Link href={existing ? `${base}/${existing.id}` : returnToBatch ? `/app/orgs/${orgId}/batches/${returnToBatch}` : base} className="inline-flex items-center px-3 text-30 text-text-weak underline-offset-2 hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
