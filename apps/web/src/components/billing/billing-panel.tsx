"use client";

import { useState } from "react";
import type { Billing } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardHeader, CardTitle, useToast } from "@/components/ui";

const LABEL: Record<string, { text: string; variant: "success" | "warning" | "error" | "neutral" }> = {
  trialing: { text: "Free trial", variant: "neutral" },
  active: { text: "Active", variant: "success" },
  past_due: { text: "Payment failed, retrying", variant: "warning" },
  unpaid: { text: "Unpaid", variant: "error" },
  canceled: { text: "Canceled", variant: "error" },
  incomplete: { text: "Waiting for payment", variant: "warning" },
  incomplete_expired: { text: "Payment not finished", variant: "error" },
};

export function BillingPanel({ orgId, billing, isOwner, mode, justSubscribed }: { orgId: string; billing: Omit<Billing, "stripeCustomerId">; isOwner: boolean; mode: "live" | "simulated"; justSubscribed: boolean }) {
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const label = LABEL[billing.status] ?? { text: billing.status, variant: "neutral" as const };
  const lapsed = !billing.writable;
  const canSubscribe = !billing.hasSubscription || ["canceled", "unpaid", "incomplete_expired"].includes(billing.status);

  async function go(kind: "checkout" | "portal") {
    setPending(kind);
    const res = kind === "checkout" ? await api().api.v1.orgs[":orgId"].billing.checkout.$post({ param: { orgId } }) : await api().api.v1.orgs[":orgId"].billing.portal.$post({ param: { orgId } });
    if (!res.ok) {
      setPending(null);
      return toast({ type: "error", title: "Could not open Stripe", description: await errorMessage(res) });
    }
    window.location.assign((await res.json()).url);
  }

  if (billing.isSample)
    return (
      <Alert>
        <AlertDescription>This is the sample organization. It is free and never needs a subscription.</AlertDescription>
      </Alert>
    );

  return (
    <div className="flex flex-col gap-4">
      {justSubscribed && (
        <Alert>
          <AlertTitle>Thank you</AlertTitle>
          <AlertDescription>Your subscription is set up. It can take a few seconds to show here.</AlertDescription>
        </Alert>
      )}
      {mode === "simulated" && (
        <Alert variant="warning">
          <AlertTitle>Test mode</AlertTitle>
          <AlertDescription>Stripe Billing keys are not set up on this server, so a stand-in is used. No real card is charged.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader className="flex flex-wrap items-center gap-2">
          <CardTitle>Subscription</CardTitle>
          <Badge variant={label.variant}>{label.text}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid gap-x-6 gap-y-1 text-30 sm:grid-cols-[12rem_1fr]">
            {billing.status === "trialing" && billing.trialEndsAt && (
              <>
                <dt className="text-text-weak">Free trial ends</dt>
                <dd>{formatDate(billing.trialEndsAt)}</dd>
              </>
            )}
            <dt className="text-text-weak">Can add and change data</dt>
            <dd>{billing.writable ? "Yes" : "No, read only"}</dd>
            {billing.readOnlyUntil && (
              <>
                <dt className="text-text-weak">Read only until at least</dt>
                <dd>{formatDate(billing.readOnlyUntil)}</dd>
              </>
            )}
          </dl>
          {lapsed && <p className="text-30 leading-5">Everything is still here. Restart the subscription to add and change data again. Exports work either way.</p>}
          {isOwner ? (
            <div className="flex flex-wrap gap-2">
              {canSubscribe && (
                <Button loading={pending === "checkout"} onClick={() => go("checkout")}>
                  {lapsed ? "Restart subscription" : "Subscribe"}
                </Button>
              )}
              {billing.hasSubscription && (
                <Button variant="secondary" loading={pending === "portal"} onClick={() => go("portal")}>
                  Manage billing
                </Button>
              )}
            </div>
          ) : (
            <p className="text-30 text-text-weak">Only the account owner can change the subscription.</p>
          )}
          {isOwner && billing.hasSubscription && <p className="text-20 text-text-weak">Manage billing opens Stripe, where you can change the card, see receipts, or cancel.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
