"use client";

import { useState } from "react";
import { accessToken } from "@/lib/api";
import { downloadWithAuth } from "@/lib/download";
import { Button, useToast } from "@/components/ui";

/** QuickBooks files for one posted batch. */
export function BatchExport({ orgId, batchId }: { orgId: string; batchId: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function get(format: "journal" | "deposits") {
    setBusy(format);
    const ok = await downloadWithAuth(`/api/v1/orgs/${orgId}/accounting/export?batchId=${batchId}&format=${format}`, await accessToken(), `quickbooks-${format}.csv`);
    setBusy(null);
    if (!ok) toast({ type: "error", title: "No file", description: "Please try again." });
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="small" variant="secondary" loading={busy === "journal"} onClick={() => get("journal")}>
        QuickBooks journal entry
      </Button>
      <Button size="small" variant="secondary" loading={busy === "deposits"} onClick={() => get("deposits")}>
        Deposit summary
      </Button>
    </div>
  );
}
