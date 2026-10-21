"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportJob, ImportRowView } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { plural } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle, Button, useToast } from "@/components/ui";

/**
 * Rows the import will bring in but that the person should look at: a lone name with no
 * other details, a date that may be day first, a payment method read as Other. These used
 * to be recorded and never shown (persona walkthroughs: "Import silently guesses").
 */
export function RowsToCheck({ orgId, job }: { orgId: string; job: ImportJob }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<ImportRowView[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await api().api.v1.orgs[":orgId"].imports[":id"].rows.$get({ param: { orgId, id: job.id }, query: { warnings: "true", limit: "100", offset: "0" } });
      if (!res.ok || cancelled) return;
      const body = (await res.json()) as { items: ImportRowView[]; total: number };
      if (cancelled) return;
      setRows(body.items);
      setTotal(body.total);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, job.id, job.counts.skip]);

  async function skip(n: number) {
    const res = await api().api.v1.orgs[":orgId"].imports[":id"].rows[":row"].$patch({ param: { orgId, id: job.id, row: String(n) }, json: { skip: true } });
    if (!res.ok) return toast({ type: "error", title: "Could not skip the row", description: await errorMessage(res) });
    router.refresh();
  }

  if (!rows || rows.length === 0) return null;
  return (
    <Alert variant="warning">
      <AlertTitle>{plural(total, "row")} to check before importing</AlertTitle>
      <AlertDescription>
        <p>These will be imported as shown unless you skip them. To change one, fix the spreadsheet and import it again.</p>
        <ul className="mt-2 flex flex-col divide-y divide-border-weaker">
          {rows.map((r) => (
            <li key={r.rowNumber} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="font-semibold">Row {r.rowNumber}</div>
                <ul className="list-disc pl-5">
                  {r.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              </div>
              <Button variant="secondary" size="small" onClick={() => skip(r.rowNumber)}>
                Skip this row<span className="sr-only"> ({r.rowNumber})</span>
              </Button>
            </li>
          ))}
        </ul>
        {total > rows.length && <p className="mt-2">The first {rows.length} are shown.</p>}
      </AlertDescription>
    </Alert>
  );
}
