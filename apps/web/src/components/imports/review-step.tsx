"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportJob, ReviewPerson } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { Alert, AlertDescription, Badge, Button, Pagination, Radio, RadioGroup, Skeleton, useToast } from "@/components/ui";

const PAGE = 20;

export function personLabel(p: Record<string, unknown>): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || (p.org_name as string) || "(no name)";
  return name;
}

export function personDetail(p: Record<string, unknown>): string {
  return [p.email, p.phone, [p.line1, p.city, p.postal_code].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}

function candidateDetail(d: NonNullable<ReviewPerson["candidates"][number]["details"]>): string {
  const gifts = d.giftCount === 0 ? "No gifts yet" : `${d.giftCount.toLocaleString()} ${d.giftCount === 1 ? "gift" : "gifts"}, last on ${formatDate(d.lastGift)}`;
  return [d.email, d.phone, d.address, gifts].filter(Boolean).join(" · ");
}

export function ReviewStep({ orgId, job }: { orgId: string; job: ImportJob }) {
  const router = useRouter();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [people, setPeople] = useState<ReviewPerson[] | null>(null);
  const [total, setTotal] = useState(0);
  const [bulk, setBulk] = useState<string | null>(null);

  // Refetch when the page changes or the server data changes (job.people moves after each decision).
  useEffect(() => {
    let cancelled = false;
    api()
      .api.v1.orgs[":orgId"].imports[":id"].people.$get({ param: { orgId, id: job.id }, query: { scope: "review", limit: String(PAGE), offset: String((page - 1) * PAGE) } })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { items: ReviewPerson[]; total: number };
        if (cancelled) return;
        setPeople(body.items);
        setTotal(body.total);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, job.id, page, job.people.review]);

  async function decideAll(all: "create" | "best_match" | "skip") {
    setBulk(all);
    const res = await api().api.v1.orgs[":orgId"].imports[":id"].decisions.$post({ param: { orgId, id: job.id }, json: { all } });
    setBulk(null);
    if (!res.ok) return toast({ type: "error", title: "Could not apply that", description: await errorMessage(res) });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>
          {job.people.review.toLocaleString()} {job.people.review === 1 ? "person looks" : "people look"} like someone already in your database, but not certainly. Decide for each one. {job.people.match.toLocaleString()} matched with certainty and {job.people.create.toLocaleString()} {job.people.create === 1 ? "is" : "are"} new.
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="small" loading={bulk === "best_match"} disabled={bulk !== null} onClick={() => decideAll("best_match")}>
          Use the closest match for all
        </Button>
        <Button variant="secondary" size="small" loading={bulk === "create"} disabled={bulk !== null} onClick={() => decideAll("create")}>
          Add all as new people
        </Button>
      </div>
      {people === null ? (
        <Skeleton className="h-32" />
      ) : (
        <ul className="flex flex-col gap-3">
          {people.map((p) => (
            <ReviewPersonCard key={p.personKey} orgId={orgId} jobId={job.id} person={p} onDecided={() => router.refresh()} />
          ))}
        </ul>
      )}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE))} onPage={setPage} label="People to review" />
    </div>
  );
}

function ReviewPersonCard({ orgId, jobId, person, onDecided }: { orgId: string; jobId: string; person: ReviewPerson; onDecided: () => void }) {
  const [choice, setChoice] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const group = `review-${person.firstRow}`;

  async function save() {
    setPending(true);
    setError(null);
    const body: { personKey: string; action: "create" | "match" | "skip"; matchId?: string } =
      choice === "create" || choice === "skip" ? { personKey: person.personKey, action: choice } : { personKey: person.personKey, action: "match", matchId: choice };
    const res = await api().api.v1.orgs[":orgId"].imports[":id"].decisions.$post({ param: { orgId, id: jobId }, json: body });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    onDecided();
  }

  return (
    <li className="rounded-30 border border-border-weaker bg-background-weakest p-4">
      <div className="text-30 leading-5">
        <div className="text-20 font-semibold uppercase tracking-wide text-text-weak">In the file</div>
        <div className="font-semibold">{personLabel(person.person)}</div>
        <div className="text-text-weak">{personDetail(person.person) || "No email, phone or address in the file"}</div>
        <div className="text-text-weak">
          Row {person.firstRow}
          {person.rowCount > 1 ? ` and ${person.rowCount - 1} more` : ""}
          {Number(person.giftTotal) > 0 ? ` · ${formatMoney(person.giftTotal)} in gifts` : ""}
        </div>
      </div>
      <RadioGroup legend="This is" className="mt-4">
        {person.candidates.map((c) => (
          <Radio
            key={c.id}
            name={group}
            value={c.id}
            label={
              // What the existing record holds, so the two can be compared. A percentage
              // alone ("70%") said nothing, even when the names were identical.
              <span className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  {c.displayName}, already in your database
                  {c.reasons.map((r) => (
                    <Badge key={r} variant="neutral">
                      {r[0]!.toUpperCase() + r.slice(1)}
                    </Badge>
                  ))}
                </span>
                {c.details && <span className="text-text-weak">{candidateDetail(c.details)}</span>}
              </span>
            }
            checked={choice === c.id}
            onChange={() => setChoice(c.id)}
          />
        ))}
        <Radio name={group} value="create" label="Someone new" checked={choice === "create"} onChange={() => setChoice("create")} />
        <Radio name={group} value="skip" label="Skip this person and their gifts" checked={choice === "skip"} onChange={() => setChoice("skip")} />
      </RadioGroup>
      {error && <p className="mt-2 text-30 text-text-error">{error}</p>}
      <div className="mt-3">
        <Button size="small" loading={pending} disabled={!choice} onClick={save}>
          Save decision
        </Button>
      </div>
    </li>
  );
}
