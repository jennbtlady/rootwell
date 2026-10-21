/** Turns Supabase auth errors into short, plain sentences without leaking details. */
export function friendlyAuthError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("missing email")) return "Enter your email.";
  if (m.includes("invalid login credentials")) return "That email and password do not match.";
  if (m.includes("email not confirmed")) return "Please confirm your email first. Check your inbox for the link.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("already registered")) return "An account with that email already exists. Try signing in.";
  if (m.includes("password") && m.includes("at least")) return "Use a password with at least 8 characters.";
  if (m.includes("invalid totp") || m.includes("invalid code") || m.includes("invalid")) return "That code did not work. Check your authenticator app and try again.";
  return "Something went wrong. Please try again.";
}
