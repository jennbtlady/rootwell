import { redirect } from "next/navigation";
import { withRls, userClaims, type Aal, type RlsTx, type UserClaims } from "@maple/db";
import { getDb } from "@maple/api";
import { createSupabaseServer } from "./supabase/server";

export type Session = {
  userId: string;
  email: string | null;
  aal: Aal;
  claims: UserClaims;
};

/** The signed-in person, from a verified access token in the cookie. Null when signed out. */
export async function getSession(): Promise<Session | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const c = data.claims as { sub: string; email?: string; aal?: string };
  const aal: Aal = c.aal === "aal2" ? "aal2" : "aal1";
  return { userId: c.sub, email: c.email ?? null, aal, claims: userClaims(c.sub, aal) };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/** Runs a read inside an RLS transaction as the signed-in person. For Server Components. */
export function withSession<T>(session: Session, fn: (tx: RlsTx) => Promise<T>): Promise<T> {
  return withRls(getDb(), session.claims, fn);
}

/** Only allow redirects back into this app, never to another site. */
export function safeNextPath(value: string | null | undefined, fallback = "/app"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
