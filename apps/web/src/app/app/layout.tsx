import Link from "next/link";
import { redirect } from "next/navigation";
import { mfaEnforcementOff } from "@maple/db";
import { getMe, mfaRequiredFor } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Button, ConfirmHost, ToastHost } from "@/components/ui";

/**
 * Every signed-in page lives under /app. This layout is where MFA is enforced:
 * anyone with a verified authenticator must use it each session, and owners and
 * admins must set one up before they can go further.
 */
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const session = await requireSession();
  // The header greets people by name; the email is a fallback for a profile with no name.
  const me = await withSession(session, (tx) => getMe(tx, session.userId));

  if (session.aal !== "aal2" && !mfaEnforcementOff()) {
    // getUser() asks Auth for the verified user, including enrolled factors.
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getUser();
    const hasAuthenticator = (data.user?.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
    if (hasAuthenticator) redirect("/mfa/verify");
    const required = await withSession(session, (tx) => mfaRequiredFor(tx, session.userId));
    if (required) redirect("/mfa/enroll");
  }

  return (
    <ToastHost>
      <ConfirmHost>
    <div className="flex min-h-full flex-1 flex-col">
      <a
        href="#main"
        className="sr-only rounded-30 bg-background-body px-4 py-2 text-30 font-semibold text-text-link shadow-focus focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50"
      >
        Skip to main content
      </a>
      <header className="border-b border-border-weaker bg-background-body">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/app" className="rounded-20 font-semibold tracking-tight outline-none focus-visible:shadow-focus">
            Rootwell
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/app/help" className="rounded-20 text-30 text-text-link outline-none hover:underline focus-visible:shadow-focus">
              Help
            </Link>
            <span className="hidden text-30 text-text-weak sm:inline" title={session.email ?? undefined}>
              {me?.fullName || session.email}
            </span>
            <form action="/auth/sign-out" method="post">
              <Button type="submit" variant="link" size="small">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 outline-none">{children}</main>
    </div>
      </ConfirmHost>
    </ToastHost>
  );
}
