"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { Button, HelpText, useConfirm } from "@/components/ui";

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
      <Button type="button" variant="secondary" loading={pending} onClick={create}>
        Explore a sample organization
      </Button>
      <HelpText>Demo data you can click around in and remove any time.</HelpText>
      {error && (
        <HelpText variant="error" role="alert">
          {error}
        </HelpText>
      )}
    </div>
  );
}

export function RemoveSampleButton({ orgId }: { orgId: string }) {
  const confirm = useConfirm();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!await confirm({ title: "Remove the sample organization?", body: "All of its demo data is deleted. Your own organizations are not touched.", confirmLabel: "Remove sample", destructive: true })) return;
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
      <Button type="button" variant="destructive_secondary" size="small" loading={pending} onClick={remove}>
        Remove sample organization
      </Button>
      {error && (
        <HelpText variant="error" role="alert">
          {error}
        </HelpText>
      )}
    </div>
  );
}
