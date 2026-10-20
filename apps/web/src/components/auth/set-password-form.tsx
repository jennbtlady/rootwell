"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} aria-describedby="password-help" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        <p id="password-help" className="text-xs text-muted-foreground">At least 8 characters. You can always sign in with an email link instead.</p>
      </div>
      <div aria-live="polite">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save password"}
      </Button>
    </form>
  );
}
