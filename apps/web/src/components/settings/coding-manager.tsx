"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CodingKind } from "@maple/core";
import type { CodingRow } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { Alert, AlertDescription, Badge, Button, Checkbox, EmptyState, FormField, Input, Modal, Select, Tab, TabList, TabPanel, Table, Tabs, TBody, TD, TH, THead, TR } from "@/components/ui";

const LABEL: Record<CodingKind, { one: string; many: string; blurb: string }> = {
  funds: { one: "fund", many: "Funds", blurb: "Where the money goes. Most small organizations need two or three." },
  campaigns: { one: "campaign", many: "Campaigns", blurb: "The effort that raised the gift. Give each a date range so old ones retire." },
  appeals: { one: "appeal", many: "Appeals", blurb: "A specific ask inside a campaign, like a mailing or an event night." },
};

export function CodingManager({ orgId, funds, campaigns, appeals }: { orgId: string; funds: CodingRow[]; campaigns: CodingRow[]; appeals: CodingRow[] }) {
  return (
    <Tabs defaultValue="funds">
      <TabList aria-label="Gift coding">
        <Tab value="funds">Funds ({funds.length})</Tab>
        <Tab value="campaigns">Campaigns ({campaigns.length})</Tab>
        <Tab value="appeals">Appeals ({appeals.length})</Tab>
      </TabList>
      <TabPanel value="funds">
        <KindPanel orgId={orgId} kind="funds" rows={funds} campaigns={campaigns} />
      </TabPanel>
      <TabPanel value="campaigns">
        <KindPanel orgId={orgId} kind="campaigns" rows={campaigns} campaigns={campaigns} />
      </TabPanel>
      <TabPanel value="appeals">
        <KindPanel orgId={orgId} kind="appeals" rows={appeals} campaigns={campaigns} />
      </TabPanel>
    </Tabs>
  );
}

function KindPanel({ orgId, kind, rows, campaigns }: { orgId: string; kind: CodingKind; rows: CodingRow[]; campaigns: CodingRow[] }) {
  const [editing, setEditing] = useState<CodingRow | "new" | null>(null);
  const l = LABEL[kind];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-30 leading-5 text-text-weak">{l.blurb}</p>
        <Button size="small" onClick={() => setEditing("new")}>
          Add {l.one}
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={`No ${l.many.toLowerCase()} yet`} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Code</TH>
              {kind === "appeals" && <TH>Campaign</TH>}
              {kind === "campaigns" && <TH align="right">Goal</TH>}
              <TH align="right">Gifts</TH>
              <TH align="right">Total</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{r.name}</TD>
                <TD className="font-mono text-20 text-text-weak">{r.code ?? ""}</TD>
                {kind === "appeals" && <TD className="text-text-weak">{campaigns.find((c) => c.id === r.campaignId)?.name ?? ""}</TD>}
                {kind === "campaigns" && <TD align="right">{r.goalAmount ? formatMoney(r.goalAmount) : ""}</TD>}
                <TD align="right">{r.giftCount}</TD>
                <TD align="right">{formatMoney(r.giftTotal)}</TD>
                <TD>{r.active ? <Badge variant="success">Active</Badge> : <Badge>Retired</Badge>}</TD>
                <TD align="right">
                  <Button variant="link" size="small" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {editing && <CodingModal orgId={orgId} kind={kind} row={editing === "new" ? null : editing} campaigns={campaigns} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CodingModal({ orgId, kind, row, campaigns, onClose }: { orgId: string; kind: CodingKind; row: CodingRow | null; campaigns: CodingRow[]; onClose: () => void }) {
  const router = useRouter();
  const l = LABEL[kind];
  const [name, setName] = useState(row?.name ?? "");
  const [code, setCode] = useState(row?.code ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [active, setActive] = useState(row?.active ?? true);
  const [startsOn, setStartsOn] = useState(row?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(row?.endsOn ?? "");
  const [goalAmount, setGoalAmount] = useState(row?.goalAmount ?? "");
  const [campaignId, setCampaignId] = useState(row?.campaignId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const body = {
      name, code: code || null, description: description || null, active, startsOn: startsOn || null, endsOn: endsOn || null,
      ...(kind === "campaigns" ? { goalAmount: goalAmount || null } : {}),
      ...(kind === "appeals" ? { campaignId: campaignId || null } : {}),
    };
    const res = row
      ? await api().api.v1.orgs[":orgId"].coding[":kind"][":id"].$patch({ param: { orgId, kind, id: row.id }, json: body })
      : await api().api.v1.orgs[":orgId"].coding[":kind"].$post({ param: { orgId, kind }, json: body });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res, "That name or code is already used."));
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={row ? `Edit ${l.one}` : `New ${l.one}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="coding-form" loading={pending} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form id="coding-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormField id="cd-name" label="Name" required>
          {(f) => <Input {...f} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="cd-code" label="Code" optional help="Short, for exports to your bookkeeping. GEN, BLDG.">
            {(f) => <Input {...f} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />}
          </FormField>
          {kind === "campaigns" && (
            <FormField id="cd-goal" label="Goal" optional>
              {(f) => <Input {...f} inputMode="decimal" insertBefore="$" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} />}
            </FormField>
          )}
          {kind === "appeals" && (
            <FormField id="cd-campaign" label="Campaign" optional>
              {(f) => (
                <Select {...f} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                  <option value="">None</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          )}
          <FormField id="cd-start" label="Starts" optional>
            {(f) => <Input {...f} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />}
          </FormField>
          <FormField id="cd-end" label="Ends" optional>
            {(f) => <Input {...f} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />}
          </FormField>
        </div>
        <FormField id="cd-desc" label="Description" optional>
          {(f) => <Input {...f} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </FormField>
        <Checkbox label="Active" help="Retired items stay on old gifts but leave the gift form." checked={active} onChange={(e) => setActive(e.target.checked)} />
        <div aria-live="polite">
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </form>
    </Modal>
  );
}
