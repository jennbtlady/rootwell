import { createHmac, randomBytes } from "node:crypto";
import type { Context } from "hono";

let localKey: Buffer | undefined;

/**
 * Visitors are counted by a keyed hash of their IP address, so the database never holds an
 * address. The key comes from INTEGRATIONS_KEY, which every deployment already has. Outside
 * production, a missing key falls back to one made for this process.
 */
function hashKey(): Buffer {
  const k = process.env.INTEGRATIONS_KEY;
  if (k) return createHmac("sha256", Buffer.from(k, "base64")).update("rate-limit-visitor").digest();
  if (process.env.NODE_ENV === "production") throw new Error("INTEGRATIONS_KEY is not set");
  localKey ??= randomBytes(32);
  return localKey;
}

export function visitorKey(ip: string): string {
  return createHmac("sha256", hashKey()).update(ip).digest("base64url").slice(0, 22);
}

/**
 * The visitor's address. Vercel sets x-forwarded-for itself, first entry first, and does not
 * pass on one the visitor sent. Local development has none.
 */
export function clientIp(header: (name: string) => string | null | undefined): string {
  const fwd = header("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || header("x-real-ip")?.trim() || "local";
}

export function visitorFrom(c: Context): string {
  return visitorKey(clientIp((n) => c.req.header(n)));
}

export const TOO_MANY = "Too many tries in a short time. Please wait a few minutes and try again.";

export function tooManyRequests(c: Context, retryAfterSeconds: number) {
  return c.json({ error: TOO_MANY, code: "rate_limited" }, 429, { "retry-after": String(retryAfterSeconds) });
}
