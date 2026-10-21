"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { OrgRole } from "@maple/core";
import type { Member } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { useEarlyTyping } from "@/lib/early-typing";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, FormField, Input, Select, useConfirm } from "@/components/ui";
import { ROLE_HELP, ROLE_LABEL } from "./role-labels";

type GrantableRole = Exclude<OrgRole, "owner">;
const GRANTABLE: GrantableRole[] = ["admin", "staff", "board_viewer"];

type Props = { orgId: string; myUserId: string; myRole: OrgRole; members: Member[] };

export function MembersManager({ orgId, myUserId, myRole, members }: Props) {
  const canManage = myRole === "owner" || myRole === "admin";
  return (
    <div className="flex flex-col gap-6">
      <MemberList orgId={orgId} myUserId={myUserId} canManage={canManage} members={members} />
      {canManage && <InviteForm orgId={orgId} />}
      {myRole === "owner" && <TransferOwnership orgId={orgId} myUserId={myUserId} members={members} />}
    </div>
  );
}

function MemberList({ orgId, myUserId, canManage, members }: { orgId: string; myUserId: string; canManage: boolean; members: Member[] }) {
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function changeRole(m: Member, role: GrantableRole) {
    setBusy(m.id);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"].members[":memberId"].$patch({ param: { orgId, memberId: m.id }, json: { role } });
    setBusy(null);
    if (!res.ok) return setError(await errorMessage(res));
    router.refresh();
  }

  async function resend(m: Member) {
    setBusy(m.id);
    setError(null);
    setNotice(null);
    const res = await api().api.v1.orgs[":orgId"].members[":memberId"].resend.$post({ param: { orgId, memberId: m.id } });
    setBusy(null);
    if (!res.ok) return setError(await errorMessage(res));
    setNotice(`Invitation sent again to ${m.email}.`);
  }

  async function remove(m: Member) {
    const what = m.status === "invited" ? `Cancel the invitation for ${m.email}?` : `Remove ${m.fullName ?? m.email} from this organization?`;
    if (!await confirm({ title: what, confirmLabel: m.status === "invited" ? "Cancel invitation" : "Remove", cancelLabel: "Keep", destructive: true })) return;
    setBusy(m.id);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"].members[":memberId"].$delete({ param: { orgId, memberId: m.id } });
    setBusy(null);
    if (res.status !== 204) return setError(await errorMessage(res));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <CardDescription>Everyone with access to this organization.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border-weaker">
          {members.map((m) => {
            const isSelf = m.userId === myUserId;
            const editable = canManage && m.role !== "owner" && !isSelf;
            return (
              <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 truncate text-30 font-medium leading-5">
                    <span className="truncate">{m.fullName ?? m.email}</span>
                    {isSelf && <span className="text-20 text-text-weak">(you)</span>}
                    {m.status === "invited" && <Badge variant="warning">Invitation sent</Badge>}
                  </div>
                  <div className="truncate text-30 leading-5 text-text-weak">
                    {m.fullName ? `${m.email} · ` : ""}
                    {ROLE_LABEL[m.role]}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editable ? (
                    <>
                      <label className="sr-only" htmlFor={`role-${m.id}`}>
                        Role for {m.email}
                      </label>
                      <Select id={`role-${m.id}`} className="w-auto" value={m.role} disabled={busy === m.id} onChange={(e) => changeRole(m, e.target.value as GrantableRole)}>
                        {GRANTABLE.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                      {m.status === "invited" && (
                        <Button type="button" variant="link" size="small" disabled={busy === m.id} onClick={() => resend(m)}>
                          Resend
                        </Button>
                      )}
                      <Button type="button" variant="destructive_link" size="small" disabled={busy === m.id} onClick={() => remove(m)}>
                        {m.status === "invited" ? "Cancel invite" : "Remove"}
                      </Button>
                    </>
                  ) : (
                    <Badge>{ROLE_LABEL[m.role]}</Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div aria-live="polite" className="mt-2">
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {notice && (
            <Alert>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InviteForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<GrantableRole>("staff");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEarlyTyping(form, (name, value) => {
    if (name === "email") setEmail(value);
    if (name === "role") setRole(value as GrantableRole);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    const res = await api().api.v1.orgs[":orgId"].members.$post({ param: { orgId }, json: { email, role } });
    setPending(false);
    if (res.status !== 201) return setError(await errorMessage(res));
    const { status } = await res.json();
    setNotice(status === "invited" ? `Invitation sent to ${email.trim().toLowerCase()}. It is good for 7 days.` : `${email.trim().toLowerCase()} already had an account and has been added.`);
    setEmail("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite someone</CardTitle>
        <CardDescription>They get an email with a link to join. Owners and admins must set up two-step sign-in.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={form} method="post" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormField id="invite-email" label="Email" required>
            {(f) => <Input {...f} type="email" autoComplete="off" required name="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </FormField>
          <FormField id="invite-role" label="Role" help={ROLE_HELP[role]}>
            {(f) => (
              <Select {...f} name="role" value={role} onChange={(e) => setRole(e.target.value as GrantableRole)}>
                {GRANTABLE.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <div aria-live="polite">
            {error && (
              <Alert variant="error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {notice && (
              <Alert>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}
          </div>
          <Button type="submit" loading={pending} disabled={!email}>
            Send invitation
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TransferOwnership({ orgId, myUserId, members }: { orgId: string; myUserId: string; members: Member[] }) {
  const confirm = useConfirm();
  const router = useRouter();
  const candidates = members.filter((m) => m.status === "active" && m.userId && m.userId !== myUserId);
  const [toUserId, setToUserId] = useState(candidates[0]?.userId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const target = candidates.find((m) => m.userId === toUserId);
    if (!target) return;
    if (!await confirm({ title: `Make ${target.fullName ?? target.email} the owner?`, body: "You will become an admin.", confirmLabel: "Transfer ownership", destructive: true })) return;
    setError(null);
    setPending(true);
    const res = await api().api.v1.orgs[":orgId"]["transfer-ownership"].$post({ param: { orgId }, json: { toUserId } });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer ownership</CardTitle>
        <CardDescription>
          The owner is the account holder. Hand it over when someone else takes charge, so the organization never depends on a person who has moved on.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {candidates.length === 0 ? (
          <p className="text-30 leading-5 text-text-weak">Invite another person first. Only active members can become the owner.</p>
        ) : (
          <form method="post" onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <FormField id="transfer-to" label="New owner">
              {(f) => (
                <Select {...f} value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
                  {candidates.map((m) => (
                    <option key={m.id} value={m.userId ?? ""}>
                      {m.fullName ?? m.email}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <div aria-live="polite">
              {error && (
                <Alert variant="error">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
            <Button type="submit" variant="secondary" loading={pending} disabled={!toUserId}>
              Transfer ownership
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
