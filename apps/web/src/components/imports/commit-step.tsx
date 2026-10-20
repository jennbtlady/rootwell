"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportJob, ReviewPerson } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle, Button, Card } from "@/components/ui";
import { personDetail, personLabel } from "./review-step";

export function CommitStep({ orgId, job, onRemap }: { orgId: string; job: ImportJob; onRemap: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matched, setMatched] = useState<ReviewPerson[]>([]);
  const gifts = job.kind === "constituents_gifts";

  useEffect(() => {
    void (async () => {
      const res = await api().api.v1.orgs[":orgId"].imports[":id"].people.$get({ param: { orgId, id: job.id }, query: { scope: "match", limit: "50", offset: "0" } });
      if (res.ok) setMatched(((await res.json()) as { items: ReviewPerson[] }).items);
    })();
  }, [orgId, job.id]);

  async function commit() {
    setPending(true);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"].imports[":id"].commit.$post({ param: { orgId, id: job.id } });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    router.refresh();
  }

  async function makeNew(p: ReviewPerson) {
    const res = await api().api.v1.orgs[":orgId"].imports[":id"].decisions.$post({ param: { orgId, id: job.id }, json: { personKey: p.personKey, action: "create" } });
    if (res.ok) router.refresh();
  }

  const stat = (label: string, value: number) => (
    <Card className="p-4 sm:p-4">
      <div className="text-20 font-semibold uppercase tracking-wide text-text-weak">{label}</div>
      <div className="mt-1 text-60 font-semibold tabular-nums">{value.toLocaleString()}</div>
    </Card>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("New people", job.people.create)}
        {stat("Matched to existing", job.people.match)}
        {gifts && stat("Gifts", job.giftRows)}
        {stat("Rows skipped", job.counts.skip)}
      </div>
      <p className="max-w-3xl text-30 leading-5 text-text-weak">
        {gifts ? "Gifts go into one posted batch named for this file. Funds and campaigns that do not exist yet are created by name. " : ""}
        Matched people keep their current details; only their gifts are added. You can roll this import back afterwards.
      </p>

      {matched.length > 0 && (
        <details className="rounded-30 border border-border-weaker bg-background-weakest p-4">
          <summary className="cursor-pointer text-30 font-semibold leading-5">See the {job.people.match.toLocaleString()} matched people</summary>
          <ul className="mt-3 divide-y divide-border-weaker">
            {matched.map((p) => (
              <li key={p.personKey} className="flex flex-wrap items-center justify-between gap-2 py-2 text-30 leading-5">
                <span>
                  <span className="font-medium">{personLabel(p.person)}</span> <span className="text-text-weak">{personDetail(p.person)}</span>
                  <span className="text-text-weak"> → {p.candidates.find((c) => c.id === p.matchId)?.displayName ?? "existing record"}</span>
                </span>
                <Button variant="link" size="small" onClick={() => makeNew(p)}>
                  Add as new instead
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div aria-live="polite">
        {error && (
          <Alert variant="error">
            <AlertTitle>Nothing was imported</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button loading={pending} onClick={commit}>
          Import {(job.people.create + job.people.match).toLocaleString()} people
        </Button>
        <Button variant="link" onClick={onRemap}>
          Change the column matching
        </Button>
      </div>
      {pending && <p className="text-30 text-text-weak">Importing. Large files take up to a minute; keep this page open.</p>}
    </div>
  );
}
