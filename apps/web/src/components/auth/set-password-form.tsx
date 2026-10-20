"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Alert, AlertDescription, Button, FormField, Input } from "@/components/ui";
import { friendlyAuthError } from "./messages";

export function SetPasswordForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use a password with at least 8 characters.");
    setPending(true);
    const { error } = await createSupabaseBrowser().auth.updateUser({ password });
    setPending(false);
    if (error) return setError(friendlyAuthError(error.message));
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField id="password" label="New password" required help="At least 8 characters. You can always sign in with an email link instead.">
        {(f) => <Input {...f} name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />}
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
