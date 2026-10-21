import Link from "next/link";
import type { Billing } from "@maple/core/services";
import { formatDate } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui";

/** One line about the subscription, shown only when someone needs to act. */
export function BillingBanner({ orgId, billing, role }: { orgId: string; billing: Billing; role: string }) {
  if (billing.isSample || role === "board_viewer") return null;
  const href = `/app/orgs/${orgId}/settings/billing`;
  const owner = role === "owner";
  const action = owner ? (
    <Link className="underline" href={href}>
      Go to Billing
    </Link>
  ) : (
    "Ask the account owner to restart it."
  );

  if (!billing.writable) {
    return (
      <Alert variant="warning">
        <AlertTitle>{billing.status === "trialing" ? "Your free trial has ended" : "Your subscription has ended"}</AlertTitle>
        <AlertDescription>
          The account is read only. You can still see and export everything, but nothing can be added or changed. {action}
          {billing.deleteOn && (
            <span className="mt-1 block">
              If no one on the team signs in by {formatDate(billing.deleteOn)}, the account and its records will be deleted. Everyone on the team gets an email first.
            </span>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  if (billing.status === "past_due") {
    return (
      <Alert variant="warning">
        <AlertTitle>A payment did not go through</AlertTitle>
        <AlertDescription>Stripe will try the card again. Everything keeps working for now. {owner ? <Link className="underline" href={href}>Update the card</Link> : "Let the account owner know."}</AlertDescription>
      </Alert>
    );
  }
  if (billing.status === "trialing" && !billing.hasSubscription && billing.trialEndsAt && billing.trialDaysLeft != null) {
    const days = billing.trialDaysLeft;
    if (days <= 7)
      return (
        <Alert>
          <AlertDescription>
            Your free trial ends in {days} day{days === 1 ? "" : "s"}, on {formatDate(billing.trialEndsAt)}. {owner ? <Link className="underline" href={href}>Subscribe to keep going</Link> : "The account owner can subscribe under Billing."}
          </AlertDescription>
        </Alert>
      );
  }
  return null;
}
