"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Alert, AlertDescription, Button, FormField, Input } from "@/components/ui";
import { friendlyAuthError } from "./messages";

export function MfaVerifyForm({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const supabase = createSupabaseBrowser();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f: { id: string; status: string }) => f.status === "verified");
    if (!factor) {
      setPending(false);
      router.push("/mfa/enroll");
      return;
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    setPending(false);
    if (error) return setError(friendlyAuthError(error.message));
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
      <FormField id="code" label="6 digit code from your authenticator app" required>
        {(f) => <Input {...f} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} />}
      </FormField>
      <div aria-live="polite">
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <Button type="submit" loading={pending} disabled={code.length < 6}>
        Continue
      </Button>
    </form>
  );
}
