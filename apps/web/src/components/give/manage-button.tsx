"use client";

import { useState } from "react";
import { Alert, AlertDescription, Button } from "@/components/ui";

/** Opens Stripe's page for this monthly gift. A press, not the link, so email scanners change nothing. */
export function ManageButton({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/v1/public/manage/${encodeURIComponent(token)}`, { method: "POST" });
    const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (res.ok && body?.url) return window.location.assign(body.url);
    setPending(false);
    setError(body?.error ?? "Something went wrong. Please try again.");
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" fullWidth loading={pending} onClick={go}>
        Change card or stop my gift
      </Button>
      {error && (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
