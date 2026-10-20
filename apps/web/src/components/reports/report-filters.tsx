"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReportParams } from "@maple/core";
import { accessToken } from "@/lib/api";
import { downloadWithAuth } from "@/lib/download";
import { Button, FormField, Input, Select, useToast } from "@/components/ui";

export function ReportFilters({ orgId, reportId, params, values, campaigns }: { orgId: string; reportId: string; params: readonly string[]; values: ReportParams; campaigns: { id: string; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const [from, setFrom] = useState(values.from ?? `${thisYear}-01-01`);
  const [to, setTo] = useState(values.to ?? new Date().toISOString().slice(0, 10));
  const [campaignId, setCampaignId] = useState(values.campaignId ?? "");
  const [downloading, setDownloading] = useState(false);

  function apply(e: FormEvent) {
    e.preventDefault();
    const q = new URLSearchParams();
    if (params.includes("from")) q.set("from", from);
    if (params.includes("to")) q.set("to", to);
    if (params.includes("campaignId") && campaignId) q.set("campaignId", campaignId);
    router.push(`${path}?${q.toString()}`);
  }

  async function download() {
    setDownloading(true);
    const q = new URLSearchParams(search.toString());
    q.set("format", "csv");
    const ok = await downloadWithAuth(`/api/v1/orgs/${orgId}/reports/${reportId}?${q.toString()}`, await accessToken(), `${reportId}.csv`);
    setDownloading(false);
    if (!ok) toast({ type: "error", title: "The download did not work", description: "Please try again." });
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-3" noValidate>
      {params.includes("from") && (
        <FormField id="rep-from" label="From">
          {(f) => <Input {...f} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
        </FormField>
      )}
      {params.includes("to") && (
        <FormField id="rep-to" label="To">
          {(f) => <Input {...f} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}
        </FormField>
      )}
      {params.includes("campaignId") && (
        <FormField id="rep-campaign" label="Campaign">
          {(f) => (
            <Select {...f} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Choose a campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      )}
      {params.length > 0 && (
        <Button type="submit" variant="secondary">
          Show
        </Button>
      )}
      <Button type="button" variant="secondary" loading={downloading} onClick={download}>
        Download spreadsheet
      </Button>
    </form>
  );
}
