"use client";

import { plural } from "@/lib/format";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FIELD_INFO, type ImportField } from "@maple/core";
import type { ImportJob, ImportRowView } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, Button, FormField, Input, Pagination, Skeleton, useToast, useConfirm } from "@/components/ui";

const PAGE = 25;

export function ProblemsStep({ orgId, job, onRemap }: { orgId: string; job: ImportJob; onRemap: () => void }) {
  const confirm = useConfirm();
  const router = useRouter();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ImportRowView[] | null>(null);
  const [total, setTotal] = useState(0);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api()
      .api.v1.orgs[":orgId"].imports[":id"].rows.$get({ param: { orgId, id: job.id }, query: { action: "error", limit: String(PAGE), offset: String((page - 1) * PAGE) } })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { items: ImportRowView[]; total: number };
        if (cancelled) return;
        setRows(body.items);
        setTotal(body.total);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, job.id, page, job.counts.error]);

  async function skipAll() {
    if (!await confirm({ title: job.counts.error === 1 ? "Skip the row with a problem?" : `Skip all ${job.counts.error} rows with problems?`, body: "They will not be imported. You can import them later from a corrected file.", confirmLabel: "Skip these rows" })) return;
    setSkipping(true);
    const res = await api().api.v1.orgs[":orgId"].imports[":id"]["skip-errors"].$post({ param: { orgId, id: job.id } });
    setSkipping(false);
    if (!res.ok) return toast({ type: "error", title: "Could not skip rows", description: await errorMessage(res) });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="warning">
        <AlertDescription>
          {job.counts.error.toLocaleString()} of {plural(job.expectedRows, "row")} {job.counts.error === 1 ? "has" : "have"} a problem. Fix each one here, skip it, or skip them all. If many rows have the same problem, a column may be matched to the wrong field.
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="small" loading={skipping} onClick={skipAll}>
          {job.counts.error === 1 ? "Skip the row with a problem" : `Skip all ${job.counts.error.toLocaleString()} rows with problems`}
        </Button>
        <Button variant="link" size="small" onClick={onRemap}>
          Change the column matching
        </Button>
      </div>

      {rows === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <ProblemRow key={r.rowNumber} orgId={orgId} jobId={job.id} row={r} onChanged={() => router.refresh()} />
          ))}
        </ul>
      )}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE))} onPage={setPage} label="Rows with problems" />
    </div>
  );
}

function ProblemRow({ orgId, jobId, row, onChanged }: { orgId: string; jobId: string; row: ImportRowView; onChanged: () => void }) {
  const fields = [...new Set(row.errors.map((e) => e.field))].filter((f): f is ImportField => f in FIELD_INFO);
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(fields.map((f) => [f, row.fields[f] ?? ""])));
  const [pending, setPending] = useState<"fix" | "skip" | null>(null);
  const [errors, setErrors] = useState(row.errors);
  const [error, setError] = useState<string | null>(null);

  async function fix() {
    setPending("fix");
    setError(null);
    const res = await api().api.v1.orgs[":orgId"].imports[":id"].rows[":row"].$patch({ param: { orgId, id: jobId, row: String(row.rowNumber) }, json: { fields: values } });
    setPending(null);
    if (!res.ok) return setError(await errorMessage(res));
    const after = (await res.json()) as ImportRowView;
    if (after.errors.length) return setErrors(after.errors);
    onChanged();
  }
  async function skip() {
    setPending("skip");
    const res = await api().api.v1.orgs[":orgId"].imports[":id"].rows[":row"].$patch({ param: { orgId, id: jobId, row: String(row.rowNumber) }, json: { skip: true } });
    setPending(null);
    if (!res.ok) return setError(await errorMessage(res));
    onChanged();
  }

  const name = [row.fields.first_name, row.fields.last_name].filter(Boolean).join(" ") || row.fields.full_name || row.fields.org_name || "(no name)";
  return (
    <li className="rounded-30 border border-border-weaker bg-background-weakest p-4">
      <div className="text-30 leading-5">
        <span className="font-semibold">Row {row.rowNumber}</span> <span className="text-text-weak">· {name}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <FormField key={f} id={`fix-${row.rowNumber}-${f}`} label={FIELD_INFO[f].label} error={errors.find((e) => e.field === f)?.message}>
            {(p) => <Input {...p} value={values[f] ?? ""} onChange={(e) => setValues({ ...values, [f]: e.target.value })} />}
          </FormField>
        ))}
        {errors.filter((e) => !(e.field in FIELD_INFO)).map((e) => (
          <p key={e.message} className="text-30 text-text-error">
            {e.message}
          </p>
        ))}
      </div>
      {error && <p className="mt-2 text-30 text-text-error">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="small" loading={pending === "fix"} disabled={pending !== null} onClick={fix}>
          Save fix
        </Button>
        <Button size="small" variant="secondary" loading={pending === "skip"} disabled={pending !== null} onClick={skip}>
          Skip this row
        </Button>
      </div>
    </li>
  );
}
