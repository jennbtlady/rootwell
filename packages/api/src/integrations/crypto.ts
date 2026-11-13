import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * App-level envelope encryption for integration credentials (AES-256-GCM).
 * INTEGRATIONS_KEY is 32 random bytes, base64. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Ciphertext format: v1.<iv>.<tag>.<data>, each base64url.
 */
function key(): Buffer {
  const k = process.env.INTEGRATIONS_KEY;
  if (!k) throw new Error("INTEGRATIONS_KEY is not set");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("INTEGRATIONS_KEY must be 32 bytes, base64");
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(box: string): string {
  const [v, iv, tag, data] = box.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unreadable credentials");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

/**
 * The private link in a monthly donor's receipt (fundraising Phase 2): which organization and
 * which Stripe subscription, signed so it cannot be guessed or changed. "manage." is part of
 * what is signed, so a link can never pass for an OAuth state or the other way round. It lasts
 * 13 months; every monthly receipt carries a fresh one.
 */
const MANAGE_TTL = 400 * 86400;
export function signManageLink(payload: { orgId: string; subscriptionId: string }): string {
  const body = Buffer.from(JSON.stringify({ o: payload.orgId, s: payload.subscriptionId, exp: Math.floor(Date.now() / 1000) + MANAGE_TTL })).toString("base64url");
  const sig = createHmac("sha256", key()).update(`manage.${body}`).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyManageLink(token: string): { orgId: string; subscriptionId: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", key()).update(`manage.${body}`).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { o?: unknown; s?: unknown; exp?: unknown };
    if (typeof p.o !== "string" || typeof p.s !== "string" || typeof p.exp !== "number" || p.exp < Date.now() / 1000) return null;
    return { orgId: p.o, subscriptionId: p.s };
  } catch {
    return null;
  }
}

/** Signed, expiring state for OAuth redirects: who started it, for which org. */
export function signState(payload: { orgId: string; userId: string }, ttlSeconds = 600): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const sig = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string): { orgId: string; userId: string } | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", key()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { orgId: string; userId: string; exp: number };
  if (p.exp < Date.now() / 1000) return null;
  return { orgId: p.orgId, userId: p.userId };
}
