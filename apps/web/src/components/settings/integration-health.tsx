"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { IntegrationHealth } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, Heading, Table, TBody, TD, TH, THead, TR, useToast } from "@/components/ui";

const NAMES: Record<string, string> = { stripe: "Stripe", mailchimp: "Mailchimp" };
const EVENT: Record<string, string> = {
  "charge.refunded": "Refund",
  "payout.paid": "Deposit",
  "checkout.session.completed": "Online gift",
  "invoice.paid": "Monthly gift",
  "customer.subscription.deleted": "Monthly gift ended",
  "account.application.deauthorized": "Disconnected",
};

export function IntegrationHealthPanel({ orgId, health, canResolve }: { orgId: string; health: IntegrationHealth; canResolve: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const connected = health.integrations.filter((i) => i.status !== "disconnected");

  async function resolve(id: string) {
    setBusy(id);
    const res = await api().api.v1.orgs[":orgId"].integrations.events[":id"].resolve.$post({ param: { orgId, id } });
    setBusy(null);
    if (!res.ok) return toast({ type: "error", title: "Not cleared", description: await errorMessage(res) });
    router.refresh();
  }

  return (
    <section aria-labelledby="ih-title" className="flex flex-col gap-3">
      <Heading id="ih-title" variant="heading40" as="h2" noMargin>
        Integrations
      </Heading>
      {connected.length === 0 ? (
        <p className="text-30 leading-5 text-text-weak">
          Nothing connected.{" "}
          {canResolve && (
            <Link className="text-text-link underline" href={`/app/orgs/${orgId}/settings/integrations`}>
              Connect Stripe or Mailchimp
            </Link>
          )}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {connected.map((i) => (
            <Card key={i.provider}>
              <div className="flex items-center gap-2">
                <span className="text-30 font-semibold">{NAMES[i.provider]}</span>
                {i.status === "error" ? <Badge variant="error">Needs attention</Badge> : <Badge variant="success">Working</Badge>}
              </div>
              <p className="mt-1 text-30 leading-5 text-text-weak">
                {i.status === "error" && i.lastError ? i.lastError : i.lastSyncAt ? `Last sync ${formatDateTime(i.lastSyncAt)}.` : i.provider === "stripe" ? "Gifts arrive as donors give." : "Not synced yet."}
              </p>
            </Card>
          ))}
        </div>
      )}
      {(health.failedLast30Days > 0 || health.stuck > 0) && (
        <p className="text-30 leading-5 text-text-warning">
          {health.failedLast30Days} message{health.failedLast30Days === 1 ? "" : "s"} from Stripe failed in the last 30 days{health.stuck ? `, and ${health.stuck} ${health.stuck === 1 ? "is" : "are"} waiting to be retried` : ""}. Stripe retries for up to three days.
        </p>
      )}
      {health.needsAttention.length > 0 && (
        <Table label="Online gifts that need a person to look">
          <THead>
            <TR>
              <TH>What</TH>
              <TH>When</TH>
              <TH>Details</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {health.needsAttention.map((e) => (
              <TR key={e.id}>
                <TD className="font-medium">{EVENT[e.type] ?? e.type}</TD>
                <TD className="text-text-weak">{formatDateTime(e.receivedAt)}</TD>
                <TD>{e.error ?? e.outcome}</TD>
                <TD align="right">
                  {canResolve && (
                    <Button size="small" variant="secondary" loading={busy === e.id} onClick={() => resolve(e.id)}>
                      Mark as done
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}
