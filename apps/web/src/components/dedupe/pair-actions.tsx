"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { Button, buttonVariants, useToast } from "@/components/ui";

export function PairActions({ orgId, pairId, status, canMerge }: { orgId: string; pairId: string; status: "open" | "merged" | "not_duplicate"; canMerge: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function setStatus(next: "open" | "not_duplicate") {
    setPending(true);
    const res = await api().api.v1.orgs[":orgId"].duplicates[":id"].$patch({ param: { orgId, id: pairId }, json: { status: next } });
    setPending(false);
    if (!res.ok) return toast({ type: "error", title: "Could not update", description: await errorMessage(res) });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "open" && canMerge && (
        <Link href={`/app/orgs/${orgId}/duplicates/${pairId}`} className={buttonVariants({ size: "small" })}>
          Compare and merge
        </Link>
      )}
      {status === "open" && !canMerge && (
        <Link href={`/app/orgs/${orgId}/duplicates/${pairId}`} className={buttonVariants({ variant: "secondary", size: "small" })}>
          Compare
        </Link>
      )}
      {status === "open" ? (
        <Button variant="link" size="small" loading={pending} onClick={() => setStatus("not_duplicate")}>
          These are different people
        </Button>
      ) : (
        <Button variant="link" size="small" loading={pending} onClick={() => setStatus("open")}>
          Reopen
        </Button>
      )}
    </div>
  );
}
