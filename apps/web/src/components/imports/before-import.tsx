"use client";

import { useEffect, useState } from "react";
import type { ImportOptions } from "@maple/core";
import type { ImportCoding, ImportJob } from "@maple/core/services";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Card, FormField, Heading, Input, Radio, RadioGroup, Select, Skeleton } from "@/components/ui";

const FIELD_LABEL = { fund: "Funds", campaign: "Campaigns", appeal: "Appeals" } as const;
const FIELD_ONE = { fund: "fund", campaign: "campaign", appeal: "appeal" } as const;

/** About a month ago: gifts older than that were almost certainly thanked in the old system. */
export function defaultThankedBefore(today = new Date()): string {
  return new Date(today.getTime() - 30 * 86400_000).toISOString().slice(0, 10);
}

/**
 * The two questions asked before a gift import runs (Marcus, in the persona walkthroughs):
 * were these gifts already thanked, and which of your funds does each name in the file mean.
 * The answers go with the import request; nothing is saved until then.
 */
export function BeforeImport({ orgId, job, options, onChange }: { orgId: string; job: ImportJob; options: ImportOptions; onChange: (o: ImportOptions) => void }) {
  const [coding, setCoding] = useState<ImportCoding | null>(null);
  const thanked = options.thankedBefore !== null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await api().api.v1.orgs[":orgId"].imports[":id"].coding.$get({ param: { orgId, id: job.id } });
      if (!res.ok || cancelled) return;
      const body = (await res.json()) as ImportCoding;
      if (cancelled) return;
      setCoding(body);
      // Start from the suggestions, so "General" is not created as a second fund by default.
      const next: ImportOptions["coding"] = { fund: {}, campaign: {}, appeal: {} };
      for (const v of body.values) next[v.field][v.value] = v.choice;
      onChange({ ...options, coding: next });
    })();
    return () => {
      cancelled = true;
    };
    // Load once per import. onChange and options are read at that moment on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, job.id]);

  function choose(field: keyof ImportOptions["coding"], value: string, choice: string) {
    onChange({ ...options, coding: { ...options.coding, [field]: { ...options.coding[field], [value]: choice } } });
  }

  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-5">
      <Heading variant="heading40" as="h2" noMargin>
        Two questions before importing
      </Heading>

      <RadioGroup legend="Were these gifts already thanked in your old system?" help="Gifts marked as thanked stay out of your thank-you list. They show as thanked on their gift date.">
        <Radio name="thanked" value="yes" label="Yes, gifts before a date were already thanked" checked={thanked} onChange={() => onChange({ ...options, thankedBefore: defaultThankedBefore() })} />
        {thanked && (
          <FormField id="thanked-before" label="Gifts dated before this were thanked" className="ml-7 max-w-xs" help={`Gifts on or after ${formatDate(options.thankedBefore)} go to your thank-you list.`}>
            {(f) => <Input {...f} type="date" required value={options.thankedBefore ?? ""} onChange={(e) => onChange({ ...options, thankedBefore: e.target.value || null })} />}
          </FormField>
        )}
        <Radio name="thanked" value="no" label="No, add every gift to the thank-you list" checked={!thanked} onChange={() => onChange({ ...options, thankedBefore: null })} />
      </RadioGroup>

      {coding === null ? (
        <Skeleton className="h-24" />
      ) : coding.values.length === 0 ? null : (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-30 font-semibold leading-5">Which of your funds and campaigns do these mean?</h3>
            <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">
              Names in the file are matched to the ones you already have. Check each one. Choose &ldquo;Add as a new&hellip;&rdquo; only for something you do not have yet.
            </p>
          </div>
          {(["fund", "campaign", "appeal"] as const).map((field) => {
            const values = coding.values.filter((v) => v.field === field);
            if (values.length === 0) return null;
            return (
              <div key={field} className="flex flex-col gap-3">
                <h4 className="text-20 font-semibold uppercase tracking-wide text-text-weak">{FIELD_LABEL[field]}</h4>
                <ul className="flex flex-col gap-3">
                  {values.map((v) => {
                    const choice = options.coding[field][v.value] ?? v.choice;
                    const id = `coding-${field}-${v.value}`.replace(/[^A-Za-z0-9_-]/g, "_");
                    return (
                      <li key={v.value} className="grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center">
                        <span className="text-30 leading-5">
                          <span className="font-semibold">&ldquo;{v.value}&rdquo;</span> <span className="text-text-weak">in {v.rows.toLocaleString()} {v.rows === 1 ? "row" : "rows"}</span>
                          {v.how === "similar" && choice !== "new" && <span className="block text-20 text-text-warning">Close match, please check</span>}
                        </span>
                        <FormField id={id} label={<span className="sr-only">{`"${v.value}" in the file is`}</span>}>
                          {(f) => (
                            <Select {...f} value={choice} onChange={(e) => choose(field, v.value, e.target.value)}>
                              {coding.existing[field].map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name}
                                </option>
                              ))}
                              <option value="new">Add as a new {FIELD_ONE[field]}: {v.value}</option>
                            </Select>
                          )}
                        </FormField>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
