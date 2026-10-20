import { hc } from "hono/client";
import type { AppType } from "./app";

/**
 * Typed client for the API. Web client components and the mobile app use this.
 * `getToken` returns the current Supabase access token, or null when signed out.
 */
export function createApiClient(baseUrl: string, getToken: () => Promise<string | null> | string | null) {
  return hc<AppType>(baseUrl, {
    headers: async (): Promise<Record<string, string>> => {
      const token = await getToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;
