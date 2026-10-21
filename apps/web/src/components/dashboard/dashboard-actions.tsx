"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { Button, useToast } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";

/** canShare: owners and admins get a way to make a board link from the page that shows what it reveals. */
export function DashboardActions({ orgId, canShare = false }: { orgId: string; canShare?: boolean }) {
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
    <div className="flex flex-wrap gap-2 print:hidden">
      {canShare && (
        <Link href={`/app/orgs/${orgId}/settings/board`} className={buttonVariants({ size: "small" })}>
          Share with your board
        </Link>
      )}
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
    <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}
