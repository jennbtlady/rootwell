"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { OrgRole } from "@maple/core";
import type { Member } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    if (!window.confirm(what)) return;
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
        <ul className="divide-y">
          {members.map((m) => {
            const isSelf = m.userId === myUserId;
            const editable = canManage && m.role !== "owner" && !isSelf;
            return (
              <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {m.fullName ?? m.email}
                    {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {m.fullName ? `${m.email} · ` : ""}
                    {m.status === "invited" ? "Invitation sent" : ROLE_LABEL[m.role]}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editable ? (
                    <>
                      <label className="sr-only" htmlFor={`role-${m.id}`}>
                        Role for {m.email}
                      </label>
                      <select
                        id={`role-${m.id}`}
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={m.role}
                        disabled={busy === m.id}
                        onChange={(e) => changeRole(m, e.target.value as GrantableRole)}
                      >
                        {GRANTABLE.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      {m.status === "invited" && (
                        <Button type="button" variant="ghost" size="sm" disabled={busy === m.id} onClick={() => resend(m)}>
                          Resend
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="sm" disabled={busy === m.id} onClick={() => remove(m)}>
                        {m.status === "invited" ? "Cancel invite" : "Remove"}
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">{ROLE_LABEL[m.role]}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div aria-live="polite" className="mt-2">
          {error && (
            <Alert variant="destructive">
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
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <select id="invite-role" className="h-9 rounded-md border bg-background px-3 text-sm" value={role} aria-describedby="invite-role-help" onChange={(e) => setRole(e.target.value as GrantableRole)}>
              {GRANTABLE.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <p id="invite-role-help" className="text-xs text-muted-foreground">
              {ROLE_HELP[role]}
            </p>
          </div>
          <div aria-live="polite">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {notice && (
              <Alert>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}
          </div>
          <Button type="submit" disabled={pending || !email}>
            {pending ? "Sending..." : "Send invitation"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TransferOwnership({ orgId, myUserId, members }: { orgId: string; myUserId: string; members: Member[] }) {
  const router = useRouter();
  const candidates = members.filter((m) => m.status === "active" && m.userId && m.userId !== myUserId);
  const [toUserId, setToUserId] = useState(candidates[0]?.userId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const target = candidates.find((m) => m.userId === toUserId);
    if (!target) return;
    if (!window.confirm(`Make ${target.fullName ?? target.email} the owner? You will become an admin.`)) return;
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
          <p className="text-sm text-muted-foreground">Invite another person first. Only active members can become the owner.</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transfer-to">New owner</Label>
              <select id="transfer-to" className="h-9 rounded-md border bg-background px-3 text-sm" value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
                {candidates.map((m) => (
                  <option key={m.id} value={m.userId ?? ""}>
                    {m.fullName ?? m.email}
                  </option>
                ))}
              </select>
            </div>
            <div aria-live="polite">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
            <Button type="submit" variant="outline" disabled={pending || !toUserId}>
              {pending ? "Transferring..." : "Transfer ownership"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
