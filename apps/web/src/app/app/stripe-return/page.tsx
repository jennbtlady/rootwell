import type { Metadata } from "next";
import { verifyState } from "@maple/api/integrations";
import { requireSession } from "@/lib/session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui";
import { StripeReturn } from "@/components/settings/stripe-return";

export const metadata: Metadata = { title: "Connecting Stripe" };

/**
 * Stripe sends people back here after they approve the connection. Stripe needs one fixed
 * return address, so the organization comes from the signed state, not the path.
 */
export default async function StripeReturnPage({ searchParams }: PageProps<"/app/stripe-return">) {
  const session = await requireSession();
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const state = one(q.state);
  const st = state ? verifyState(state) : null;
  if (!st || st.userId !== session.userId)
    return (
      <Alert variant="error">
        <AlertTitle>Stripe is not connected</AlertTitle>
        <AlertDescription>That connection link expired or was started by someone else. Go back to Settings, Integrations and try again.</AlertDescription>
      </Alert>
    );
  return <StripeReturn orgId={st.orgId} code={one(q.code)} state={state} error={one(q.error_description) ?? one(q.error)} />;
}
