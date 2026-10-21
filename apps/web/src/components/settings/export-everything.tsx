"use client";

import { useState } from "react";
import { accessToken } from "@/lib/api";
import { downloadWithAuth } from "@/lib/download";
import { Button, useToast } from "@/components/ui";

export function ExportEverythingButton({ orgId }: { orgId: string }) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  async function go() {
    setPending(true);
    const ok = await downloadWithAuth(`/api/v1/orgs/${orgId}/export/everything`, await accessToken(), "rootwell-export.zip");
    setPending(false);
    if (!ok) toast({ type: "error", title: "No file", description: "Only owners and admins can download everything. Please try again." });
  }
  return (
    <Button loading={pending} onClick={go}>
      Download everything
    </Button>
  );
}
