"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AccountingSettings } from "@maple/core";
import type { Integration } from "@maple/core/services";
import { accessToken, api, errorMessage } from "@/lib/api";
import { downloadWithAuth } from "@/lib/download";
import { formatDateTime } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, FormField, Input, Select, useToast, useConfirm } from "@/components/ui";

function Status({ i }: { i: Integration | null }) {
  if (!i || i.status === "disconnected") return <Badge>Not connected</Badge>;
  if (i.status === "error") return <Badge variant="error">Needs attention</Badge>;
  return <Badge variant="success">Connected</Badge>;
}

export function IntegrationsSettings(props: { orgId: string; stripe: Integration | null; mailchimp: Integration | null; stripeMode: "live" | "simulated"; accounting: AccountingSettings }) {
  return (
    <div className="flex flex-col gap-4">
      <StripeCard {...props} />
      <MailchimpCard {...props} />
      <QuickBooksCard {...props} />
    </div>
  );
}

function StripeCard({ orgId, stripe, stripeMode }: { orgId: string; stripe: Integration | null; stripeMode: "live" | "simulated" }) {
  const confirm = useConfirm();
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const connected = stripe?.status === "connected";

  async function connect() {
    setPending("connect");
    const res = await api().api.v1.orgs[":orgId"].integrations.stripe.connect.$post({ param: { orgId } });
    if (!res.ok) {
      setPending(null);
      return toast({ type: "error", title: "Could not start", description: await errorMessage(res) });
    }
    window.location.assign((await res.json()).url);
  }
  async function disconnect() {
    if (!await confirm({ title: "Disconnect Stripe?", body: "Your giving pages stop taking gifts until you connect again. Gifts already recorded stay.", confirmLabel: "Disconnect Stripe", destructive: true })) return;
    setPending("disconnect");
    const res = await api().api.v1.orgs[":orgId"].integrations.stripe.$delete({ param: { orgId } });
    setPending(null);
    if (res.status !== 204) return toast({ type: "error", title: "Not disconnected", description: await errorMessage(res) });
    router.refresh();
  }
  async function simulatePayout() {
    setPending("payout");
    const res = await api().api.v1.orgs[":orgId"].integrations.stripe["simulate-payout"].$post({ param: { orgId } });
    setPending(null);
    if (!res.ok) return toast({ type: "error", title: "No deposit made", description: await errorMessage(res) });
    toast({ type: "success", title: "Test deposit made", description: "Look for a new batch called Stripe deposit under Batches." });
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-2">
        <CardTitle>Stripe</CardTitle>
        <Status i={stripe} />
        {stripeMode === "simulated" && <Badge variant="warning">Test mode</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <CardDescription>
          Donors give on your giving page and pay through Stripe. Each gift is added for you, matched to the donor if they are already here. When Stripe pays out to your bank, the deposit becomes a batch for you to check and post.
        </CardDescription>
        {stripeMode === "simulated" && (
          <Alert variant="warning">
            <AlertTitle>Test mode</AlertTitle>
            <AlertDescription>Stripe keys are not set up on this server, so a stand-in is used. No real cards are charged.</AlertDescription>
          </Alert>
        )}
        {connected ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-30 text-text-weak">
              Account <span className="font-mono">{stripe?.accountId}</span>
            </p>
            <Link href={`/app/orgs/${orgId}/settings/giving`} className="text-30 text-text-link underline">
              Set up giving pages
            </Link>
            <span className="grow" />
            {stripeMode === "simulated" && (
              <Button variant="secondary" size="small" loading={pending === "payout"} onClick={simulatePayout}>
                Make a test deposit
              </Button>
            )}
            <Button variant="destructive_secondary" size="small" loading={pending === "disconnect"} onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <div>
            <Button loading={pending === "connect"} onClick={connect}>
              Connect Stripe
            </Button>
            <p className="mt-1 text-20 text-text-weak">You will sign in to Stripe, or make a free account, and then come back here.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MailchimpCard({ orgId, mailchimp }: { orgId: string; mailchimp: Integration | null }) {
  const confirm = useConfirm();
  const router = useRouter();
  const toast = useToast();
  const connected = !!mailchimp && mailchimp.status !== "disconnected";
  const [key, setKey] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [audiences, setAudiences] = useState<{ id: string; name: string; memberCount: number }[] | null>(null);
  const [listId, setListId] = useState(String(mailchimp?.config.listId ?? ""));
  const [permission, setPermission] = useState(Boolean(mailchimp?.config.permissionConfirmed));
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    (async () => {
      const res = await api().api.v1.orgs[":orgId"].integrations.mailchimp.audiences.$get({ param: { orgId } });
      if (res.ok) setAudiences((await res.json()).items);
      else setAudiences([]);
    })();
  }, [connected, orgId]);

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    setPending("key");
    setKeyError(null);
    const res = await api().api.v1.orgs[":orgId"].integrations.mailchimp.key.$put({ param: { orgId }, json: { apiKey: key } });
    setPending(null);
    if (!res.ok) return setKeyError(await errorMessage(res));
    setKey("");
    toast({ type: "success", title: "Mailchimp connected" });
    router.refresh();
  }
  async function saveConfig(e: FormEvent) {
    e.preventDefault();
    setPending("config");
    const res = await api().api.v1.orgs[":orgId"].integrations.mailchimp.config.$patch({ param: { orgId }, json: { listId, permissionConfirmed: permission } });
    setPending(null);
    if (!res.ok) return toast({ type: "error", title: "Not saved", description: await errorMessage(res) });
    toast({ type: "success", title: "Saved" });
    router.refresh();
  }
  async function sync() {
    setPending("sync");
    const res = await api().api.v1.orgs[":orgId"].integrations.mailchimp.sync.$post({ param: { orgId } });
    setPending(null);
    if (!res.ok) return toast({ type: "error", title: "Sync did not run", description: await errorMessage(res) });
    const r = await res.json();
    toast({ type: r.failed ? "error" : "success", title: "Sync finished", description: `${r.sent} sent, ${r.unsubscribed} kept off the list, ${r.failed} failed.` });
    router.refresh();
  }
  async function disconnect() {
    if (!await confirm({ title: "Disconnect Mailchimp?", body: "Nothing in Mailchimp is deleted.", confirmLabel: "Disconnect Mailchimp", destructive: true })) return;
    const res = await api().api.v1.orgs[":orgId"].integrations.mailchimp.$delete({ param: { orgId } });
    if (res.status === 204) router.refresh();
  }

  const summary = mailchimp?.lastSyncSummary as { sent?: number; unsubscribed?: number; failed?: number } | null;
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-2">
        <CardTitle>Mailchimp</CardTitle>
        <Status i={mailchimp} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <CardDescription>
          Sends names, emails, and tags from here to one Mailchimp audience. It only sends. People marked do not email, do not contact, or deceased are kept off the list. Anyone who unsubscribed in Mailchimp stays unsubscribed.
        </CardDescription>
        {mailchimp?.status === "error" && mailchimp.lastError && (
          <Alert variant="error">
            <AlertTitle>The last sync failed</AlertTitle>
            <AlertDescription>{mailchimp.lastError}</AlertDescription>
          </Alert>
        )}
        {!connected ? (
          <form method="post" onSubmit={saveKey} className="flex flex-wrap items-end gap-2" noValidate>
            <FormField id="mc-key" className="w-full sm:w-80" label="Mailchimp API key" error={keyError} help="In Mailchimp, open your profile, then Extras, then API keys. Make a key and paste it here. It is stored encrypted.">
              {(f) => <Input {...f} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />}
            </FormField>
            <Button type="submit" loading={pending === "key"} disabled={key.trim().length < 10}>
              Connect
            </Button>
          </form>
        ) : (
          <>
            <form method="post" onSubmit={saveConfig} className="flex flex-col gap-3" noValidate>
              <FormField id="mc-list" label="Audience" help="Mailchimp calls a mailing list an audience.">
                {(f) => (
                  <Select {...f} value={listId} onChange={(e) => setListId(e.target.value)} disabled={!audiences}>
                    <option value="">{audiences ? "Choose an audience" : "Loading…"}</option>
                    {audiences?.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.memberCount.toLocaleString("en-US")} subscribed)
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <Checkbox
                label="The people in our records agreed to get email from us"
                help="Leave this off if you are not sure. New people are then added to Mailchimp without being subscribed, so you can follow up with them first."
                checked={permission}
                onChange={(e) => setPermission(e.target.checked)}
              />
              <div>
                <Button type="submit" variant="secondary" loading={pending === "config"} disabled={!listId}>
                  Save
                </Button>
              </div>
            </form>
            <div className="flex flex-wrap items-center gap-2 border-t border-border-weaker pt-3">
              <p className="text-30 text-text-weak">
                {mailchimp?.lastSyncAt ? `Last sync ${formatDateTime(mailchimp.lastSyncAt)}: ${summary?.sent ?? 0} sent, ${summary?.failed ?? 0} failed.` : "Not synced yet."}
              </p>
              <span className="grow" />
              <Button size="small" loading={pending === "sync"} disabled={!mailchimp?.config.listId} onClick={sync}>
                Sync now
              </Button>
              <Button variant="destructive_secondary" size="small" onClick={disconnect}>
                Disconnect
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QuickBooksCard({ orgId, accounting }: { orgId: string; accounting: AccountingSettings }) {
  const toast = useToast();
  const [a, setA] = useState({ depositAccount: accounting.depositAccount ?? "", feeAccount: accounting.feeAccount ?? "", defaultIncomeAccount: accounting.defaultIncomeAccount ?? "" });
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setPending("save");
    const res = await api().api.v1.orgs[":orgId"].accounting.$put({ param: { orgId }, json: { depositAccount: a.depositAccount || null, feeAccount: a.feeAccount || null, defaultIncomeAccount: a.defaultIncomeAccount || null } });
    setPending(null);
    if (!res.ok) return toast({ type: "error", title: "Not saved", description: await errorMessage(res) });
    toast({ type: "success", title: "Saved" });
  }
  async function download(format: "journal" | "deposits") {
    setPending(format);
    const r = await downloadWithAuth(`/api/v1/orgs/${orgId}/accounting/export?format=${format}&from=${from}&to=${to}`, await accessToken(), `quickbooks-${format}.csv`);
    setPending(null);
    if (!r.ok) toast({ type: "error", title: "No file", description: r.reason ?? "Check the dates and try again." });
  }
  const field = (k: keyof typeof a, label: string, help: string, placeholder: string) => (
    <FormField id={`qb-${k}`} label={label} optional help={help}>
      {(f) => <Input {...f} placeholder={placeholder} value={a[k]} onChange={(e) => setA({ ...a, [k]: e.target.value })} />}
    </FormField>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>QuickBooks</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CardDescription>
          Download your posted batches as journal entries for QuickBooks Online. Each batch becomes one entry: the deposit to your bank, any card fees, and the gifts by fund. Use the account names exactly as they appear in your QuickBooks chart of accounts.
        </CardDescription>
        <form method="post" onSubmit={save} className="grid gap-4 sm:grid-cols-3" noValidate>
          {field("depositAccount", "Bank account", "Where deposits land.", "Checking")}
          {field("feeAccount", "Fees account", "An expense account for card fees.", "Bank and payment fees")}
          {field("defaultIncomeAccount", "Default income account", "For funds without their own. Set a fund's own account under Funds.", "Contributions")}
          <div className="sm:col-span-3">
            <Button type="submit" variant="secondary" loading={pending === "save"}>
              Save account names
            </Button>
          </div>
        </form>
        <fieldset className="flex flex-wrap items-end gap-2 border-t border-border-weaker pt-3">
          <legend className="sr-only">Download</legend>
          <FormField id="qb-from" label="From">
            {(f) => <Input {...f} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
          </FormField>
          <FormField id="qb-to" label="To">
            {(f) => <Input {...f} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}
          </FormField>
          <Button loading={pending === "journal"} onClick={() => download("journal")}>
            Download journal entries
          </Button>
          <Button variant="secondary" loading={pending === "deposits"} onClick={() => download("deposits")}>
            Download deposit summary
          </Button>
        </fieldset>
        <p className="text-20 text-text-weak">In QuickBooks Online, choose Settings, then Import data, then Journal entries, and pick the downloaded file.</p>
      </CardContent>
    </Card>
  );
}
