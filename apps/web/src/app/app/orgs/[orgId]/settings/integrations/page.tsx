import type { Metadata } from "next";
import { getAccountingSettings, listIntegrations } from "@maple/core/services";
import { stripeGateway } from "@maple/api/integrations";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { IntegrationsSettings } from "@/components/settings/integrations-settings";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage({ params }: PageProps<"/app/orgs/[orgId]/settings/integrations">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [items, accounting] = await withSession(session, (tx) => Promise.all([listIntegrations(tx, orgId), getAccountingSettings(tx, orgId)]));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          Integrations
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">
          Take gifts online with Stripe, keep your Mailchimp list up to date, and send deposits to QuickBooks. Only owners and admins can change these.
        </p>
      </div>
      <IntegrationsSettings
        orgId={orgId}
        stripe={items.find((i) => i.provider === "stripe") ?? null}
        mailchimp={items.find((i) => i.provider === "mailchimp") ?? null}
        stripeMode={stripeGateway().mode}
        accounting={accounting ?? { depositAccount: null, feeAccount: null, defaultIncomeAccount: null }}
      />
    </div>
  );
}
