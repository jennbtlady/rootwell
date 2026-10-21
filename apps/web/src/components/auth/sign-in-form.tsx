"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Alert, AlertDescription, Button, FormField, Input } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { friendlyAuthError } from "./messages";

export function SignInForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState<"password" | "link" | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(null);

// The fields are read from the form when it is sent, not from React state. On a slow first
// load, text typed before the page's scripts start never reached state, and sign-in went
// out with no email. method="post" means a press that early can never put the password in
// the address bar.
  const field = (name: string) => String(new FormData(form.current ?? undefined).get(name) ?? "").trim();

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const email = field("email");
    const password = String(new FormData(form.current ?? undefined).get("password") ?? "");
    if (!email) return setError("Enter your email.");
    if (!password) return sendLink();
    setPending("password");
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(null);
    if (error) return setError(friendlyAuthError(error.message));
    router.push(next);
    router.refresh();
  }

  async function sendLink() {
    const email = field("email");
    if (!email) return setError("Enter your email first, then we can send a link.");
    setError(null);
    setNotice(null);
    setPending("link");
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setPending(null);
    if (error) return setError(friendlyAuthError(error.message));
    setNotice("Check your email for a sign-in link. It works for one hour.");
  }

  return (
    <form ref={form} method="post" onSubmit={signInWithPassword} className="flex flex-col gap-4" noValidate>
      <FormField id="email" label="Email" required>
        {(f) => <Input {...f} name="email" type="email" autoComplete="email" required />}
      </FormField>
      <FormField id="password" label="Password" help="Leave this empty to get a sign-in link by email instead.">
        {(f) => <Input {...f} name="password" type="password" autoComplete="current-password" />}
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

      <Button type="submit" loading={pending === "password"} disabled={pending !== null}>
        Sign in
      </Button>
      <Button type="button" variant="secondary" loading={pending === "link"} disabled={pending !== null} onClick={sendLink}>
        Email me a sign-in link instead
      </Button>

      <p className="text-center text-30 text-text-weak">
        New here?{" "}
        <Link href="/sign-up" className={anchorClass}>
          Create an account
        </Link>
      </p>
    </form>
  );
}
