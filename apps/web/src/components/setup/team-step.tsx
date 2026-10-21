"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { ROLE_HELP, ROLE_LABEL } from "@/components/orgs/role-labels";
import { Alert, AlertDescription, Badge, Button, FormField, Input, Select, useToast } from "@/components/ui";
import { Intro, SkipButton, type WizardData, type WizardNav } from "./setup-wizard";

/** Invite people right here. Optional: plenty of organizations start with one person. */
export function TeamStep({ data, nav }: { data: WizardData; nav: WizardNav }) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "staff" | "board_viewer">("staff");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"].members.$post({ param: { orgId: data.org.id }, json: { email, role } });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res, "That invitation did not go out. Check the email address."));
    toast({ type: "success", title: `Invitation sent to ${email}` });
    setEmail("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <Intro>Who else should use this? Each person gets their own sign-in, so you never share a password. Optional: you can do this later.</Intro>
      <ul className="flex flex-col gap-1 text-30 leading-5">
        {data.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2">
            <span>{m.fullName ?? m.email}</span>
            {m.userId === data.myUserId && <span className="text-text-weak">(you)</span>}
            <Badge>{ROLE_LABEL[m.role]}</Badge>
            {m.status === "invited" && <Badge variant="warning">Invited</Badge>}
          </li>
        ))}
      </ul>
      <form onSubmit={invite} className="flex flex-col gap-3" noValidate>
        <div className="grid max-w-2xl gap-3 sm:grid-cols-[1fr_12rem]">
          <FormField id="team-email" label="Email">
            {(f) => <Input {...f} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </FormField>
          <FormField id="team-role" label="What they can do">
            {(f) => (
              <Select {...f} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
                <option value="board_viewer">Board viewer</option>
              </Select>
            )}
          </FormField>
        </div>
        <p className="max-w-2xl text-30 leading-5 text-text-weak">{ROLE_HELP[role]}</p>
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div>
          <Button type="submit" variant="secondary" loading={pending} disabled={!email.includes("@")}>
            Send invitation
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-2 border-t border-border-weaker pt-4">
        <Button onClick={nav.next}>Continue</Button>
        {data.members.length <= 1 && <SkipButton onClick={nav.skip} label="It's just me for now" />}
      </div>
    </div>
  );
}
