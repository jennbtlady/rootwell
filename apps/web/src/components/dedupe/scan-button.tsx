"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { Button, useToast } from "@/components/ui";

export function ScanButton({ orgId }: { orgId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  async function scan() {
    setPending(true);
    const res = await api().api.v1.orgs[":orgId"].duplicates.scan.$post({ param: { orgId } });
    setPending(false);
    if (!res.ok) return toast({ type: "error", title: "Scan failed", description: await errorMessage(res) });
    const { open } = await res.json();
    toast({ type: "success", title: "Scan finished", description: open === 0 ? "No possible duplicates found." : `${open} possible duplicate${open === 1 ? "" : "s"} to review.` });
    router.refresh();
  }
  return (
    <Button variant="secondary" loading={pending} onClick={scan}>
      Scan for duplicates
    </Button>
  );
}
