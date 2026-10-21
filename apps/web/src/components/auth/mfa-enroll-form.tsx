"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Alert, AlertDescription, Button, FormField, Input } from "@/components/ui";
import { friendlyAuthError } from "./messages";

type Enrollment = { factorId: string; qrCode: string; secret: string };

// One enrollment per page load, shared across React's double-run of effects in
// development. Two parallel enroll calls would make Supabase reject the second.
let inflight: Promise<Enrollment> | null = null;

async function startEnrollment(): Promise<Enrollment> {
  const supabase = createSupabaseBrowser();
  // Clear any half-finished enrollment from an earlier attempt.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  // listFactors() puts only verified factors under `totp`, so look at `all`.
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
  if (error || !data) throw new Error(error?.message ?? "enroll failed");
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export function MfaEnrollForm({ next }: { next: string }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    inflight ??= startEnrollment();
    inflight
      .then((e) => {
        if (!cancelled) setEnrollment(e);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(friendlyAuthError(err.message));
      })
      .finally(() => {
        inflight = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!enrollment) return;
    setError(null);
    setPending(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code: code.trim() });
    setPending(false);
    if (error) return setError(friendlyAuthError(error.message));
    router.push(next);
    router.refresh();
  }

  if (!enrollment) {
    return (
      <div aria-live="polite">
        {error ? (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <p className="text-30 text-text-weak">Preparing your setup code...</p>
        )}
      </div>
    );
  }

  return (
    <form method="post" onSubmit={verify} className="flex flex-col gap-4" noValidate>
      <ol className="list-decimal space-y-2 pl-5 text-30 leading-5">
        <li>Open an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator, or 1Password.</li>
        <li>Scan this code, or type the setup key by hand.</li>
        <li>Enter the 6 digit code the app shows.</li>
      </ol>

      <div className="flex justify-center rounded-30 border border-border-weaker bg-background-weakest p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enrollment.qrCode} alt="Setup code to scan with your authenticator app" width={192} height={192} />
      </div>
      <p className="text-20 text-text-weak">
        Setup key: <code className="select-all break-all font-mono">{enrollment.secret}</code>
      </p>

      <FormField id="code" label="6 digit code" required>
        {(f) => <Input {...f} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />}
      </FormField>

      <div aria-live="polite">
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <Button type="submit" loading={pending} disabled={code.length < 6}>
        Turn on two-step sign-in
      </Button>
    </form>
  );
}
