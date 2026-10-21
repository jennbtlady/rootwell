"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ShareLink } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, FormField, Input, Table, TBody, TD, TH, THead, TR, useToast, useConfirm, CopyButton } from "@/components/ui";

export function BoardSharing({ orgId, hideNames, links }: { orgId: string; hideNames: boolean; links: ShareLink[] }) {
  const confirm = useConfirm();
  const router = useRouter();
  const toast = useToast();
  const [hide, setHide] = useState(hideNames);
  const [label, setLabel] = useState("Board of directors");
  const [created, setCreated] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function toggle(next: boolean) {
    setHide(next);
    const res = await api().api.v1.orgs[":orgId"]["board-settings"].$patch({ param: { orgId }, json: { hideBoardNames: next } });
    if (!res.ok) {
      setHide(!next);
      return toast({ type: "error", title: "Not saved", description: await errorMessage(res) });
    }
    toast({ type: "success", title: next ? "Donor names hidden from the board" : "Donor names shown to the board" });
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await api().api.v1.orgs[":orgId"]["board-links"].$post({ param: { orgId }, json: { label } });
    setPending(false);
    if (res.status !== 201) return toast({ type: "error", title: "No link made", description: await errorMessage(res) });
    const { token } = await res.json();
    setCreated(`${window.location.origin}/board/${token}`);
    router.refresh();
  }

  async function revoke(l: ShareLink) {
    if (!await confirm({ title: `Turn off "${l.label}"?`, body: "Anyone using it will see a page saying the link is no longer active.", confirmLabel: "Turn off link", destructive: true })) return;
    const res = await api().api.v1.orgs[":orgId"]["board-links"][":id"].$delete({ param: { orgId, id: l.id } });
    if (res.status === 204) router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Checkbox label="Hide donor names from the board" help="The top gifts list says &quot;A donor&quot; instead of names, on board links and for Board viewers." checked={hide} onChange={(e) => toggle(e.target.checked)} />
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Make a link</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="flex flex-wrap items-end gap-2" noValidate>
            <FormField id="link-label" label="Who it is for">
              {(f) => <Input {...f} value={label} onChange={(e) => setLabel(e.target.value)} />}
            </FormField>
            <Button type="submit" loading={pending} disabled={!label.trim()}>
              Make link
            </Button>
          </form>
          {created && (
            <Alert>
              <AlertTitle>Copy this link now</AlertTitle>
              <AlertDescription>
                <p className="break-all font-mono text-20">{created}</p>
                <p className="mt-1">It is shown once. Anyone with it can see the dashboard until you turn it off.</p>
                <div className="mt-2">
                  <CopyButton text={created} size="small" variant="secondary" />
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      {links.length > 0 && (
        <Table label="Board links">
          <THead>
            <TR>
              <TH>For</TH>
              <TH>Made</TH>
              <TH>Last opened</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {links.map((l) => (
              <TR key={l.id}>
                <TD className="font-medium">{l.label}</TD>
                <TD className="text-text-weak">{formatDateTime(l.createdAt)}</TD>
                <TD className="text-text-weak">{l.lastViewedAt ? formatDateTime(l.lastViewedAt) : "Never"}</TD>
                <TD>{l.revokedAt ? <Badge>Off</Badge> : <Badge variant="success">On</Badge>}</TD>
                <TD align="right">
                  {!l.revokedAt && (
                    <Button variant="destructive_link" size="small" onClick={() => revoke(l)}>
                      Turn off
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
