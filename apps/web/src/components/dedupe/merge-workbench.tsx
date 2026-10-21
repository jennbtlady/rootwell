"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Constituent } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle, Button, Radio, RadioGroup, useToast, useConfirm } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";

type Side = "a" | "b";

/** Scalar fields an admin can choose between. Column name on the left, label on the right. */
const FIELDS: { key: string; label: string; get: (c: Constituent) => string }[] = [
  { key: "type", label: "Type", get: (c) => c.type },
  { key: "prefix", label: "Prefix", get: (c) => c.prefix ?? "" },
  { key: "first_name", label: "First name", get: (c) => c.firstName ?? "" },
  { key: "middle_name", label: "Middle name", get: (c) => c.middleName ?? "" },
  { key: "last_name", label: "Last name", get: (c) => c.lastName ?? "" },
  { key: "suffix", label: "Suffix", get: (c) => c.suffix ?? "" },
  { key: "preferred_name", label: "Goes by", get: (c) => c.preferredName ?? "" },
  { key: "org_name", label: "Organization or household name", get: (c) => c.orgName ?? "" },
  { key: "source", label: "Source", get: (c) => c.source ?? "" },
  { key: "do_not_contact", label: "Do not contact", get: (c) => (c.doNotContact ? "Yes" : "No") },
  { key: "do_not_email", label: "No email", get: (c) => (c.doNotEmail ? "Yes" : "No") },
  { key: "do_not_mail", label: "No mail", get: (c) => (c.doNotMail ? "Yes" : "No") },
  { key: "do_not_call", label: "No calls", get: (c) => (c.doNotCall ? "Yes" : "No") },
  { key: "deceased", label: "Deceased", get: (c) => (c.deceased ? "Yes" : "No") },
  { key: "notes", label: "Notes", get: (c) => c.notes ?? "" },
];

export function MergeWorkbench({ orgId, a, b, canMerge }: { orgId: string; a: Constituent; b: Constituent; canMerge: boolean }) {
  const confirm = useConfirm();
  const router = useRouter();
  const toast = useToast();
  const [survivor, setSurvivor] = useState<Side>(a.giftCount >= b.giftCount ? "a" : "b");
  const [choices, setChoices] = useState<Record<string, Side>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const differing = FIELDS.filter((f) => f.get(a) !== f.get(b));
  const keep = survivor === "a" ? a : b;
  const other = survivor === "a" ? b : a;
  // Two records often share a name ("Merge Ruth Goldberg into Ruth Goldberg"), so each is
  // also named by when it was added and how many gifts it has.
  const describe = (c: Constituent) => `${c.displayName}, added ${formatDate(c.createdAt)}, ${c.giftCount} ${c.giftCount === 1 ? "gift" : "gifts"}`;
  const sameName = keep.displayName === other.displayName;
  const mergeSummary = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt className="font-semibold">Keeping</dt>
      <dd>{describe(keep)}</dd>
      <dt className="font-semibold">Merging in</dt>
      <dd>{describe(other)}</dd>
      <dd className="col-span-2 mt-2 text-text-weak">Gifts, notes and relationships move to the record you keep. You can undo this for 30 days.</dd>
    </dl>
  );

  async function merge() {
    const sure = await confirm({ title: "Merge these records?", body: mergeSummary, confirmLabel: "Merge", destructive: true });
    if (!sure) return;
    setPending(true);
    setError(null);
    // Decisions are relative to the survivor: "b" means take the other record's value.
    const decisions: Record<string, "a" | "b"> = {};
    for (const f of differing) {
      const pick = choices[f.key] ?? survivor;
      decisions[f.key] = pick === survivor ? "a" : "b";
    }
    const res = await api().api.v1.orgs[":orgId"].merges.$post({ param: { orgId }, json: { survivorId: keep.id, mergedId: other.id, decisions } });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    toast({ type: "success", title: "Records merged", description: `${other.displayName} is now part of ${keep.displayName}. Undo is on the Data health page for 30 days.` });
    router.push(`/app/orgs/${orgId}/constituents/${keep.id}`);
    router.refresh();
  }

  const column = (c: Constituent, side: Side) => (
    <div className="flex flex-col gap-2 text-30 leading-5">
      <Link href={`/app/orgs/${orgId}/constituents/${c.id}`} className={anchorClass + " text-40 font-semibold"}>
        {c.displayName}
      </Link>
      <div className="text-text-weak">
        {c.giftCount} gift{c.giftCount === 1 ? "" : "s"} · {formatMoney(c.lifetimeTotal)} lifetime{c.lastGiftOn ? ` · last ${formatDate(c.lastGiftOn)}` : ""}
      </div>
      <div className="text-text-weak">Added {formatDate(c.createdAt)}</div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-text-weak">Emails</dt>
        <dd>{c.emails.map((e) => e.email).join(", ") || "none"}</dd>
        <dt className="text-text-weak">Phones</dt>
        <dd>{c.phones.map((p) => p.phone).join(", ") || "none"}</dd>
        <dt className="text-text-weak">Addresses</dt>
        <dd>{c.addresses.map((x) => [x.line1, x.city, x.postalCode].filter(Boolean).join(", ")).join(" / ") || "none"}</dd>
        <dt className="text-text-weak">Tags</dt>
        <dd>{c.tags.map((t) => t.name).join(", ") || "none"}</dd>
        <dt className="text-text-weak">Relationships</dt>
        <dd>{c.relationships.length}</dd>
      </dl>
      {canMerge && (
        <div className="mt-2">
          <Radio name="survivor" value={side} label={`Keep this record (added ${formatDate(c.createdAt)})`} help="Its id and history stay. The other record's gifts and notes move here." checked={survivor === side} onChange={() => setSurvivor(side)} />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 rounded-30 border border-border-weaker bg-background-weakest p-4 sm:grid-cols-2 sm:p-6">
        {column(a, "a")}
        {column(b, "b")}
      </div>

      {canMerge ? (
        <>
          {differing.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-40 font-medium">Fields that differ</h2>
              <p className="text-30 leading-5 text-text-weak">Pick which value to keep. Everything else is combined: emails, phones, addresses, tags, gifts, notes and relationships all come along.</p>
              {differing.map((f) => (
                <RadioGroup key={f.key} legend={f.label}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Radio name={`field-${f.key}`} value="a" label={f.get(a) || "(empty)"} checked={(choices[f.key] ?? survivor) === "a"} onChange={() => setChoices({ ...choices, [f.key]: "a" })} />
                    <Radio name={`field-${f.key}`} value="b" label={f.get(b) || "(empty)"} checked={(choices[f.key] ?? survivor) === "b"} onChange={() => setChoices({ ...choices, [f.key]: "b" })} />
                  </div>
                </RadioGroup>
              ))}
            </section>
          )}
          <div aria-live="polite">
            {error && (
              <Alert variant="error">
                <AlertTitle>The records were not merged</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <div className="rounded-30 border border-border-weaker bg-background-weakest p-4 text-30 leading-5">{mergeSummary}</div>
          <div className="flex flex-wrap gap-2">
            <Button loading={pending} onClick={merge}>
              {sameName ? `Merge, keeping the record added ${formatDate(keep.createdAt)}` : `Merge ${other.displayName} into ${keep.displayName}`}
            </Button>
            <Link href={`/app/orgs/${orgId}/duplicates`} className="inline-flex items-center px-3 text-30 text-text-weak underline-offset-2 hover:underline">
              Back to the queue
            </Link>
          </div>
        </>
      ) : (
        <Alert>
          <AlertDescription>Only an owner or admin can merge records. If these are the same person, let them know. If not, mark the pair as different from the queue.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
