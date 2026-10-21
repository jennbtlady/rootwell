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
  // Kept for the "Check your email" message after sending.
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

// The fields are read from the form when it is sent, not from React state. On a slow first
// load, text typed before the page's scripts start never reached state, and sign-in went
// out with no email. method="post" means a press that early can never put the password in
// the address bar.
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const fullName = String(fd.get("fullName") ?? "");
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    setEmail(email);
    if (!email) return setError("Enter your email.");
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
    <form method="post" onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField id="fullName" label="Your name" required>
        {(f) => <Input {...f} name="fullName" autoComplete="name" required />}
      </FormField>
      <FormField id="email" label="Email" required>
        {(f) => <Input {...f} name="email" type="email" autoComplete="email" required />}
      </FormField>
      <FormField id="password" label="Password" required help="At least 8 characters.">
        {(f) => <Input {...f} name="password" type="password" autoComplete="new-password" required minLength={8} />}
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
