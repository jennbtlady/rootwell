"use client";

import { plural } from "@/lib/format";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FIELD_INFO, fieldsFor, suggestMapping, STARTER_MAPPINGS, type ImportField } from "@maple/core";
import type { ImportJob, SavedMapping } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, Button, Checkbox, FormField, Input, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

type ColumnMap = Record<string, ImportField | "">;

function toColumns(headers: string[], mapping: Partial<Record<ImportField, string>>): ColumnMap {
  const out: ColumnMap = Object.fromEntries(headers.map((h) => [h, ""]));
  for (const [f, h] of Object.entries(mapping) as [ImportField, string][]) if (h in out) out[h] = f;
  return out;
}

export function MappingStep({ orgId, job, samples, saved, onDone }: { orgId: string; job: ImportJob; samples: string[][]; saved: SavedMapping[]; onDone: () => void }) {
  const router = useRouter();
  const sameHeaders = saved.find((m) => m.kind === job.kind && m.headers.length === job.headers.length && m.headers.every((h, i) => h === job.headers[i]));
  const suggestion = useMemo(() => suggestMapping(job.headers, job.kind), [job.headers, job.kind]);
  const initial = Object.keys(job.mapping).length ? job.mapping : sameHeaders ? sameHeaders.mapping : suggestion.mapping;
  const [columns, setColumns] = useState<ColumnMap>(toColumns(job.headers, initial));
  const [save, setSave] = useState(!sameHeaders);
  const [saveName, setSaveName] = useState(sameHeaders?.name ?? job.fileName.replace(/\.[^.]+$/, ""));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = fieldsFor(job.kind);
  const starter = STARTER_MAPPINGS.find((s) => s.id === suggestion.starter);
  const uploadIncomplete = job.uploadedRows < job.expectedRows;

  function pick(header: string, field: ImportField | "") {
    setColumns((cur) => {
      const next = { ...cur };
      if (field) for (const h of Object.keys(next)) if (next[h] === field) next[h] = "";
      next[header] = field;
      return next;
    });
  }

  const chosen = new Set(Object.values(columns).filter(Boolean));
  const hasName = chosen.has("first_name") || chosen.has("last_name") || chosen.has("full_name") || chosen.has("org_name");
  const giftsOk = job.kind === "constituents" || (chosen.has("amount") && chosen.has("gift_date"));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const mapping: Partial<Record<ImportField, string>> = {};
    for (const [h, f] of Object.entries(columns)) if (f) mapping[f] = h;
    const res = await api().api.v1.orgs[":orgId"].imports[":id"].mapping.$put({ param: { orgId, id: job.id }, json: { mapping, saveAs: save && saveName.trim() ? saveName.trim() : undefined } });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    onDone();
    router.refresh();
  }

  if (uploadIncomplete) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          Only {job.uploadedRows.toLocaleString()} of {job.expectedRows.toLocaleString()} rows arrived. Start the import again from the file.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <p className="max-w-3xl text-30 leading-5 text-text-weak">
        {sameHeaders
          ? `This file has the same columns as your saved mapping "${sameHeaders.name}", so we used it.`
          : starter
            ? `This looks like a ${starter.name} export. We matched the columns we recognized.`
            : "We matched the columns we recognized."}{" "}
        Check each one. Columns set to &quot;Don&apos;t import&quot; are ignored.
      </p>
      <Table label="Columns in your file">
        <THead>
          <TR>
            <TH>Column in your file</TH>
            <TH>Example</TH>
            <TH>Goes into</TH>
          </TR>
        </THead>
        <TBody>
          {job.headers.map((h, i) => (
            <TR key={h}>
              <TD className="font-medium">{h}</TD>
              <TD className="max-w-56 truncate text-text-weak">{samples.map((r) => r[i]).filter(Boolean).slice(0, 2).join(", ")}</TD>
              <TD className="min-w-56">
                <label htmlFor={`map-${i}`} className="sr-only">
                  Field for {h}
                </label>
                <Select id={`map-${i}`} value={columns[h] ?? ""} onChange={(e) => pick(h, e.target.value as ImportField | "")}>
                  <option value="">Don&apos;t import</option>
                  <optgroup label="Person">
                    {allowed.filter((f) => FIELD_INFO[f].group === "person").map((f) => (
                      <option key={f} value={f}>
                        {FIELD_INFO[f].label}
                      </option>
                    ))}
                  </optgroup>
                  {job.kind === "constituents_gifts" && (
                    <optgroup label="Gift">
                      {allowed.filter((f) => FIELD_INFO[f].group === "gift").map((f) => (
                        <option key={f} value={f}>
                          {FIELD_INFO[f].label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <div className="flex max-w-xl flex-col gap-3">
        <Checkbox label="Save this mapping for next time" help="Files with the same columns will be matched the same way." checked={save} onChange={(e) => setSave(e.target.checked)} />
        {save && (
          <FormField id="map-name" label="Mapping name">
            {(f) => <Input {...f} value={saveName} onChange={(e) => setSaveName(e.target.value)} />}
          </FormField>
        )}
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {!hasName && (
          <Alert variant="warning">
            <AlertDescription>Choose a column for a name: first name, last name, full name, or organization.</AlertDescription>
          </Alert>
        )}
        {!giftsOk && (
          <Alert variant="warning">
            <AlertDescription>For people with gifts, choose the columns for the gift amount and the gift date.</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <div>
        <Button type="submit" loading={pending} disabled={!hasName || !giftsOk}>
          Check {plural(job.expectedRows, "row")}
        </Button>
      </div>
    </form>
  );
}
