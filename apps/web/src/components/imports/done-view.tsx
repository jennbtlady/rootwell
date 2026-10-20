"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ImportJob } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle, Button, Card, useToast } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";

type Summary = {
  peopleCreated?: number;
  peopleMatched?: number;
  gifts?: number;
  giftTotal?: number;
  skipped?: number;
  fundsCreated?: number;
  campaignsCreated?: number;
  appealsCreated?: number;
  rolledBack?: { gifts: number; people: number; coding: number; keptPeople: string[] };
};

export function DoneView({ orgId, job }: { orgId: string; job: ImportJob }) {
  const router = useRouter();
  const toast = useToast();
  const s = job.summary as Summary;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/app/orgs/${orgId}`;

  async function rollback() {
    if (!window.confirm(`Roll back this import? ${s.gifts ?? 0} gifts and ${s.peopleCreated ?? 0} people it created will be removed. People who existed before are not touched.`)) return;
    setPending(true);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"].imports[":id"].rollback.$post({ param: { orgId, id: job.id } });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    toast({ type: "success", title: "Import rolled back" });
    router.refresh();
  }

  const row = (label: string, value: string | number | undefined) =>
    value === undefined || value === 0 ? null : (
      <>
        <dt className="text-text-weak">{label}</dt>
        <dd className="tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</dd>
      </>
    );

  return (
    <div className="flex flex-col gap-4">
      {job.status === "rolled_back" ? (
        <Alert>
          <AlertTitle>This import was rolled back on {formatDateTime(job.rolledBackAt)}</AlertTitle>
          <AlertDescription>
            Removed {s.rolledBack?.gifts ?? 0} gifts and {s.rolledBack?.people ?? 0} people.
            {s.rolledBack && s.rolledBack.keptPeople.length > 0 ? ` ${s.rolledBack.keptPeople.length} people were kept because they gained gifts, notes or relationships after the import.` : ""}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>Imported on {formatDateTime(job.committedAt)}</AlertTitle>
          <AlertDescription>New people now appear in Constituents. Check Data health for any duplicates the import created.</AlertDescription>
        </Alert>
      )}
      <Card>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-30 leading-5">
          {row("New people", s.peopleCreated)}
          {row("Matched to existing people", s.peopleMatched)}
          {row("Gifts", s.gifts)}
          {row("Gift total", s.giftTotal ? formatMoney(s.giftTotal) : undefined)}
          {row("Rows skipped", s.skipped)}
          {row("Funds created", s.fundsCreated)}
          {row("Campaigns created", s.campaignsCreated)}
          {row("Appeals created", s.appealsCreated)}
        </dl>
      </Card>
      {job.status === "committed" && (
        <div className="flex flex-wrap items-center gap-3">
          {job.batchId && (
            <Link href={`${base}/batches/${job.batchId}`} className={`${anchorClass} text-30`}>
              Open the batch of imported gifts
            </Link>
          )}
          <Link href={`${base}/health`} className={`${anchorClass} text-30`}>
            Data health
          </Link>
          <Button variant="destructive_secondary" loading={pending} onClick={rollback}>
            Roll back this import
          </Button>
        </div>
      )}
      {error && <p className="text-30 text-text-error">{error}</p>}
    </div>
  );
}
