"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { Button, useToast } from "@/components/ui";

export function UndoMergeButton({ orgId, mergeId, mergedName }: { orgId: string; mergeId: string; mergedName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  async function undo() {
    if (!window.confirm(`Undo this merge? ${mergedName} comes back as a separate record with its gifts and notes.`)) return;
    setPending(true);
    const res = await api().api.v1.orgs[":orgId"].merges[":id"].undo.$post({ param: { orgId, id: mergeId } });
    setPending(false);
    if (!res.ok) return toast({ type: "error", title: "Could not undo", description: await errorMessage(res) });
    toast({ type: "success", title: "Merge undone", description: `${mergedName} is back.` });
    router.refresh();
  }
  return (
    <Button variant="destructive_link" size="small" loading={pending} onClick={undo}>
      Undo
    </Button>
  );
}
