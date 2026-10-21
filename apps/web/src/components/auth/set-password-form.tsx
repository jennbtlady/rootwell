"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Alert, AlertDescription, Button, FormField, Input } from "@/components/ui";
import { friendlyAuthError } from "./messages";

export function SetPasswordForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

// The fields are read from the form when it is sent, not from React state. On a slow first
// load, text typed before the page's scripts start never reached state, and sign-in went
// out with no email. method="post" means a press that early can never put the password in
// the address bar.
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (password.length < 8) return setError("Use a password with at least 8 characters.");
    setPending(true);
    const { error } = await createSupabaseBrowser().auth.updateUser({ password });
    setPending(false);
    if (error) return setError(friendlyAuthError(error.message));
    router.push(next);
    router.refresh();
  }

  return (
    <form method="post" onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField id="password" label="New password" required help="At least 8 characters. You can always sign in with an email link instead.">
        {(f) => <Input {...f} name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus />}
      </FormField>
      <div aria-live="polite">
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <Button type="submit" loading={pending}>
        Save password
      </Button>
    </form>
  );
}
