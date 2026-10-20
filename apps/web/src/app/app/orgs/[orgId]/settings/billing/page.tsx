import type { Metadata } from "next";
import { getBilling, getOrg } from "@maple/core/services";
import { billingGateway } from "@maple/api/integrations";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { BillingPanel } from "@/components/billing/billing-panel";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({ params, searchParams }: PageProps<"/app/orgs/[orgId]/settings/billing">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const session = await requireSession();
  const [billing, org] = await withSession(session, (tx) => Promise.all([getBilling(tx, orgId), getOrg(tx, orgId)]));
  if (!billing || !org) return null;
  const { stripeCustomerId: _c, ...b } = billing;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          Billing
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">One monthly price, with a 30-day free trial. Cancel any time. If the subscription ends, your data stays here, read only, and you can always export it.</p>
      </div>
      <BillingPanel orgId={orgId} billing={b} isOwner={org.role === "owner"} mode={billingGateway().mode} justSubscribed={sp.subscribed === "1"} />
    </div>
  );
}
