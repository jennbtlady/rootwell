"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { Button, useToast } from "@/components/ui";

export function DashboardActions({ orgId }: { orgId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  async function refresh() {
    setPending(true);
    const res = await api().api.v1.orgs[":orgId"].dashboard.refresh.$post({ param: { orgId } });
    setPending(false);
    if (!res.ok) return toast({ type: "error", title: "Could not refresh", description: await errorMessage(res) });
    router.refresh();
  }
  return (
    <div className="flex gap-2 print:hidden">
      <Button variant="secondary" size="small" loading={pending} onClick={refresh}>
        Refresh now
      </Button>
      <Button variant="secondary" size="small" onClick={() => window.print()}>
        Print or save as PDF
      </Button>
    </div>
  );
}

export function PrintButton() {
  return (
    <Button variant="secondary" size="small" className="print:hidden" onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}
