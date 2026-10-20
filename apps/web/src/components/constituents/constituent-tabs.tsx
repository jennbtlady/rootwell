"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { INTERACTION_TYPES, RELATIONSHIP_TYPES } from "@maple/core";
import type { AuditEntry, Constituent, Gift, Interaction } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, formatMoney, today } from "@/lib/format";
import { Alert, AlertDescription, Badge, Button, Checkbox, Combobox, EmptyState, FormField, Input, Select, Tab, TabList, TabPanel, Table, Tabs, TBody, TD, Textarea, TH, THead, TR } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import type { ComboboxItem } from "@/components/ui";

const TYPE_LABEL: Record<string, string> = { call: "Call", meeting: "Meeting", email: "Email", letter: "Letter", event: "Event", note: "Note", other: "Other" };

type Props = {
  orgId: string;
  constituent: Constituent;
  gifts: Gift[];
  interactions: Interaction[];
  audit: AuditEntry[];
  allTags: { id: string; name: string }[];
  userId: string;
};

export function ConstituentTabs({ orgId, constituent: c, gifts, interactions, audit, allTags }: Props) {
  return (
    <Tabs defaultValue="gifts">
      <TabList aria-label="Constituent details">
        <Tab value="gifts">Gifts ({gifts.length})</Tab>
        <Tab value="interactions">Interactions ({interactions.length})</Tab>
        <Tab value="relationships">Relationships ({c.relationships.length})</Tab>
        <Tab value="details">Details</Tab>
        <Tab value="history">History</Tab>
      </TabList>
      <TabPanel value="gifts">
        <GiftsPanel orgId={orgId} gifts={gifts} />
      </TabPanel>
      <TabPanel value="interactions">
        <InteractionsPanel orgId={orgId} constituentId={c.id} interactions={interactions} />
      </TabPanel>
      <TabPanel value="relationships">
        <RelationshipsPanel orgId={orgId} constituent={c} />
      </TabPanel>
      <TabPanel value="details">
        <DetailsPanel orgId={orgId} constituent={c} allTags={allTags} />
      </TabPanel>
      <TabPanel value="history">
        <HistoryPanel audit={audit} />
      </TabPanel>
    </Tabs>
  );
}

function GiftsPanel({ orgId, gifts }: { orgId: string; gifts: Gift[] }) {
  if (gifts.length === 0) return <EmptyState title="No gifts yet">Gifts entered in a batch will show up here.</EmptyState>;
  return (
    <Table label="Gifts">
      <THead>
        <TR>
          <TH>Date</TH>
          <TH align="right">Amount</TH>
          <TH>Fund</TH>
          <TH>Campaign</TH>
          <TH>Method</TH>
          <TH>Status</TH>
        </TR>
      </THead>
      <TBody>
        {gifts.map((g) => (
          <TR key={g.id}>
            <TD>
              <Link href={`/app/orgs/${orgId}/batches/${g.batchId ?? ""}`} className={g.batchId ? anchorClass : ""}>
                {formatDate(g.giftDate)}
              </Link>
            </TD>
            <TD align="right">{formatMoney(g.amount)}</TD>
            <TD>{g.fundName ?? ""}</TD>
            <TD className="text-text-weak">{g.campaignName ?? ""}</TD>
            <TD className="text-text-weak">
              {g.paymentMethod === "check" && g.checkNumber ? `Check #${g.checkNumber}` : g.paymentMethod.replace("_", " ")}
            </TD>
            <TD>{g.postedAt ? <Badge variant="success">Posted</Badge> : <Badge variant="warning">In open batch</Badge>}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function InteractionsPanel({ orgId, constituentId, interactions }: { orgId: string; constituentId: string; interactions: Interaction[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof INTERACTION_TYPES)[number]>("call");
  const [occurredOn, setOccurredOn] = useState(today());
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"].constituents[":id"].interactions.$post({ param: { orgId, id: constituentId }, json: { type, occurredOn, summary, details: details || null } });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    setSummary("");
    setDetails("");
    setOpen(false);
    router.refresh();
  }

  async function remove(i: Interaction) {
    if (!window.confirm("Delete this interaction?")) return;
    const res = await api().api.v1.orgs[":orgId"].constituents[":id"].interactions[":subId"].$delete({ param: { orgId, id: constituentId, subId: i.id } });
    if (res.status === 204) router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {!open && (
        <div>
          <Button variant="secondary" size="small" onClick={() => setOpen(true)}>
            Log a call, meeting or note
          </Button>
        </div>
      )}
      {open && (
        <form onSubmit={submit} className="flex max-w-xl flex-col gap-4 rounded-30 border border-border-weaker bg-background-weakest p-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="int-type" label="Type">
              {(f) => (
                <Select {...f} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  {INTERACTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField id="int-date" label="Date" required>
              {(f) => <Input {...f} type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />}
            </FormField>
          </div>
          <FormField id="int-summary" label="Summary" required help="One line, the way you would say it to a coworker.">
            {(f) => <Input {...f} value={summary} onChange={(e) => setSummary(e.target.value)} />}
          </FormField>
          <FormField id="int-details" label="Details" optional>
            {(f) => <Textarea {...f} value={details} onChange={(e) => setDetails(e.target.value)} />}
          </FormField>
          <div aria-live="polite">
            {error && (
              <Alert variant="error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={pending} disabled={!summary.trim()}>
              Save
            </Button>
            <Button type="button" variant="link" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {interactions.length === 0 ? (
        <EmptyState title="Nothing logged yet">Calls, meetings and notes build the story of this relationship.</EmptyState>
      ) : (
        <ul className="divide-y divide-border-weaker">
          {interactions.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 py-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-30 leading-5">
                  <Badge>{TYPE_LABEL[i.type] ?? i.type}</Badge>
                  <span className="font-medium">{i.summary}</span>
                </div>
                <div className="mt-1 text-30 leading-5 text-text-weak">
                  {formatDate(i.occurredOn)}
                  {i.ownerName ? ` · ${i.ownerName}` : ""}
                </div>
                {i.details && <p className="mt-1 whitespace-pre-wrap text-30 leading-5">{i.details}</p>}
              </div>
              <Button variant="destructive_link" size="small" onClick={() => remove(i)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RelationshipsPanel({ orgId, constituent: c }: { orgId: string; constituent: Constituent }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState<ComboboxItem | null>(null);
  const [results, setResults] = useState<ComboboxItem[]>([]);
  const [type, setType] = useState(RELATIONSHIP_TYPES[0]!.type);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(q: string) {
    if (!q.trim()) return setResults([]);
    const res = await api().api.v1.orgs[":orgId"].constituents.$get({ param: { orgId }, query: { q, limit: "8" } });
    if (!res.ok) return;
    const { items } = (await res.json()) as { items: { id: string; displayName: string; primaryEmail: string | null }[] };
    setResults(items.filter((i) => i.id !== c.id).map((i) => ({ id: i.id, label: i.displayName, detail: i.primaryEmail })));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!other) return;
    setPending(true);
    setError(null);
    const rt = RELATIONSHIP_TYPES.find((r) => r.type === type);
    const res = await api().api.v1.orgs[":orgId"].constituents[":id"].relationships.$post({ param: { orgId, id: c.id }, json: { toConstituentId: other.id, type, reciprocalType: rt?.reciprocal ?? null } });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    setOther(null);
    setOpen(false);
    router.refresh();
  }

  async function remove(id: string) {
    const res = await api().api.v1.orgs[":orgId"].constituents[":id"].relationships[":subId"].$delete({ param: { orgId, id: c.id, subId: id } });
    if (res.status === 204) router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {!open && (
        <div>
          <Button variant="secondary" size="small" onClick={() => setOpen(true)}>
            Add relationship
          </Button>
        </div>
      )}
      {open && (
        <form onSubmit={submit} className="flex max-w-xl flex-col gap-4 rounded-30 border border-border-weaker bg-background-weakest p-4" noValidate>
          <FormField id="rel-type" label={`${c.displayName} is the`}>
            {(f) => (
              <Select {...f} value={type} onChange={(e) => setType(e.target.value)}>
                {RELATIONSHIP_TYPES.map((r) => (
                  <option key={r.type} value={r.type}>
                    {r.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField id="rel-other" label="of" required>
            {(f) => <Combobox id={f.id} items={results} value={other} onChange={setOther} onSearch={search} placeholder="Type a name" aria-describedby={f["aria-describedby"]} />}
          </FormField>
          <div aria-live="polite">
            {error && (
              <Alert variant="error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={pending} disabled={!other}>
              Save
            </Button>
            <Button type="button" variant="link" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {c.relationships.length === 0 ? (
        <EmptyState title="No relationships yet">Link spouses, employers and household members so gifts and thank-yous land right.</EmptyState>
      ) : (
        <ul className="divide-y divide-border-weaker">
          {c.relationships.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-30 leading-5">
              <div>
                <span className="text-text-weak">{labelFor(r.type)} of </span>
                <Link href={`/app/orgs/${orgId}/constituents/${r.other.id}`} className={anchorClass + " font-medium"}>
                  {r.other.displayName}
                </Link>
              </div>
              <Button variant="destructive_link" size="small" onClick={() => remove(r.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function labelFor(type: string) {
  return RELATIONSHIP_TYPES.find((r) => r.type === type)?.label ?? type.replace(/_/g, " ");
}

function DetailsPanel({ orgId, constituent: c, allTags }: { orgId: string; constituent: Constituent; allTags: { id: string; name: string }[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(c.tags.map((t) => t.id)));
  const [newTag, setNewTag] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveTags(next: Set<string>) {
    setSelected(next);
    setPending(true);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"].constituents[":id"].tags.$put({ param: { orgId, id: c.id }, json: { tagIds: [...next] } });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    router.refresh();
  }

  async function addTag(e: FormEvent) {
    e.preventDefault();
    if (!newTag.trim()) return;
    const res = await api().api.v1.orgs[":orgId"].tags.$post({ param: { orgId }, json: { name: newTag.trim() } });
    if (!res.ok) return setError(await errorMessage(res));
    const { id } = (await res.json()) as { id: string };
    setNewTag("");
    await saveTags(new Set([...selected, id]));
  }

  const row = (label: string, value: React.ReactNode) =>
    value ? (
      <>
        <dt className="text-text-weak">{label}</dt>
        <dd>{value}</dd>
      </>
    ) : null;

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-30 leading-5">
          {row("Emails", c.emails.length ? c.emails.map((e) => `${e.email}${e.isPrimary ? " (primary)" : ""}`).join(", ") : null)}
          {row("Phones", c.phones.length ? c.phones.map((p) => p.phone).join(", ") : null)}
          {row(
            "Addresses",
            c.addresses.length
              ? c.addresses.map((a) => (
                  <div key={a.id}>{[a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", "), a.postalCode].filter(Boolean).join(", ")}</div>
                ))
              : null,
          )}
          {row("Source", c.source)}
          {row("Preferences", [c.doNotEmail && "No email", c.doNotMail && "No mail", c.doNotCall && "No calls"].filter(Boolean).join(", ") || null)}
          {row("Notes", c.notes ? <span className="whitespace-pre-wrap">{c.notes}</span> : null)}
          {row("Added", formatDate(c.createdAt))}
        </dl>
      </div>
      <div className="flex flex-col gap-3">
        <div className="text-30 font-medium leading-5">Tags</div>
        {allTags.length === 0 && <p className="text-30 leading-5 text-text-weak">No tags yet. Add one below.</p>}
        <div className="flex flex-col gap-2">
          {allTags.map((t) => (
            <Checkbox
              key={t.id}
              label={t.name}
              checked={selected.has(t.id)}
              disabled={pending}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(t.id);
                else next.delete(t.id);
                void saveTags(next);
              }}
            />
          ))}
        </div>
        <form onSubmit={addTag} className="flex items-end gap-2">
          <FormField id="new-tag" label="New tag" className="flex-1">
            {(f) => <Input {...f} value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Board, Volunteer, Monthly donor" />}
          </FormField>
          <Button type="submit" variant="secondary" disabled={!newTag.trim() || pending}>
            Add
          </Button>
        </form>
        <div aria-live="polite">
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({ audit }: { audit: AuditEntry[] }) {
  if (audit.length === 0) return <EmptyState title="No history" />;
  return (
    <ul className="divide-y divide-border-weaker">
      {audit.map((a) => (
        <li key={a.id} className="flex flex-col gap-1 py-3 text-30 leading-5">
          <div>
            <span className="font-medium capitalize">{a.action === "insert" ? "Created" : a.action === "update" ? "Updated" : a.action}</span>
            <span className="text-text-weak">
              {" "}
              by {a.actorName ?? (a.actorKind === "system" ? "the system" : "someone")} on {formatDateTime(a.createdAt)}
            </span>
          </div>
          {a.action === "update" && <ChangedFields before={a.before as Record<string, unknown>} after={a.after as Record<string, unknown>} />}
        </li>
      ))}
    </ul>
  );
}

const HIDDEN = new Set(["updated_at", "updated_by", "created_at", "created_by", "display_name", "sort_name", "search_vector"]);

function ChangedFields({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const keys = Object.keys(after ?? {}).filter((k) => !HIDDEN.has(k) && JSON.stringify(before?.[k]) !== JSON.stringify(after[k]));
  if (keys.length === 0) return null;
  return (
    <ul className="text-text-weak">
      {keys.map((k) => (
        <li key={k}>
          {k.replace(/_/g, " ")}: {String(before?.[k] ?? "empty")} to {String(after[k] ?? "empty")}
        </li>
      ))}
    </ul>
  );
}
