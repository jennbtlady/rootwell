"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function ExploreSampleButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);
    const res = await api().api.v1.orgs.sample.$post();
    setPending(false);
    if (res.status !== 201) return setError(await errorMessage(res));
    const { id } = await res.json();
    router.push(`/app/orgs/${id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" disabled={pending} onClick={create}>
        {pending ? "Setting up..." : "Explore a sample organization"}
      </Button>
      <p className="text-xs text-muted-foreground">Demo data you can click around in and remove any time.</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function RemoveSampleButton({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("Remove the sample organization and all of its demo data?")) return;
    setPending(true);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"].$delete({ param: { orgId } });
    setPending(false);
    if (res.status !== 204) return setError(await errorMessage(res));
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={remove}>
        {pending ? "Removing..." : "Remove sample organization"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
