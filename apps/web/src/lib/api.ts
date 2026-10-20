"use client";

import { createApiClient } from "@maple/api/client";
import { createSupabaseBrowser } from "./supabase/browser";

/** Typed API client for Client Components, sending the current Supabase access token. */
export function api() {
  return createApiClient(window.location.origin, async () => {
    const { data } = await createSupabaseBrowser().auth.getSession();
    return data.session?.access_token ?? null;
  });
}

/** Reads the API's error body into one plain sentence for the person. */
export async function errorMessage(res: Response, fallback = "Something went wrong. Please try again."): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; issues?: { message: string }[] };
    return body.issues?.[0]?.message ?? body.error ?? fallback;
  } catch {
    return fallback;
  }
}
