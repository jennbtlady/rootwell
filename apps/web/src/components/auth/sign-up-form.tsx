"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Alert, AlertDescription, AlertTitle, Button, FormField, Input } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { friendlyAuthError } from "./messages";

export function SignUpForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use a password with at least 8 characters.");
    setPending(true);
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setPending(false);
    if (error) return setError(friendlyAuthError(error.message));
    if (data.session) {
      router.push("/app");
      router.refresh();
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Alert>
        <AlertTitle>Check your email</AlertTitle>
        <AlertDescription>We sent a confirmation link to {email}. Open it to finish creating your account.</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField id="fullName" label="Your name" required>
        {(f) => <Input {...f} name="fullName" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />}
      </FormField>
      <FormField id="email" label="Email" required>
        {(f) => <Input {...f} name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
      </FormField>
      <FormField id="password" label="Password" required help="At least 8 characters.">
        {(f) => <Input {...f} name="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />}
      </FormField>

      <div aria-live="polite">
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <Button type="submit" loading={pending}>
        Create account
      </Button>

      <p className="text-center text-30 text-text-weak">
        Already have an account?{" "}
        <Link href="/sign-in" className={anchorClass}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
