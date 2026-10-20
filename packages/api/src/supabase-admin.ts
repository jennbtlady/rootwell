import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/**
 * Server-only Supabase client with the secret key. Used for Auth administration
 * (sending invitations). Never for tenant data: that goes through withRls().
 */
export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return client;
}

/** For tests. */
export function setSupabaseAdmin(c: SupabaseClient | undefined) {
  client = c;
}
