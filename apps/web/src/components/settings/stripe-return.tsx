"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle, Spinner } from "@/components/ui";

export function StripeReturn({ orgId, code, state, error }: { orgId: string; code: string | null; state: string | null; error: string | null }) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(error ?? (!code || !state ? "Stripe did not finish the connection." : null));
  const started = useRef(false);

  useEffect(() => {
    if (problem || started.current || !code || !state) return;
    started.current = true;
    (async () => {
      const res = await api().api.v1.orgs[":orgId"].integrations.stripe.complete.$post({ param: { orgId }, json: { code, state } });
      if (!res.ok) return setProblem(await errorMessage(res));
      router.replace(`/app/orgs/${orgId}/settings/integrations?connected=stripe`);
    })();
  }, [code, state, orgId, problem, router]);

  if (problem)
    return (
      <Alert variant="error">
        <AlertTitle>Stripe is not connected</AlertTitle>
        <AlertDescription>
          <p>{problem}</p>
          <p className="mt-2">
            <Link className="underline" href={`/app/orgs/${orgId}/settings/integrations`}>
              Back to Integrations
            </Link>
          </p>
        </AlertDescription>
      </Alert>
    );
  return (
    <p className="flex items-center gap-2 text-30" role="status">
      <Spinner /> Finishing the connection to Stripe…
    </p>
  );
}
