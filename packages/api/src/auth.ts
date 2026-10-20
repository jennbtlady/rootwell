import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from "jose";
import { userClaims } from "@maple/db";
import type { ApiEnv } from "./env";

type Verifier = (token: string) => Promise<JWTPayload>;

let cached: Verifier | undefined;

/**
 * Verifies a Supabase access token.
 * Supabase signs tokens with asymmetric keys (ES256 or RS256) published at the JWKS
 * URL. Projects still on the legacy shared secret issue HS256 tokens; for those,
 * SUPABASE_JWT_SECRET must be set. The token's own header decides which path runs,
 * so a project can migrate from one to the other without a deploy.
 */
export function supabaseVerifier(): Verifier {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  const issuer = `${url.replace(/\/$/, "")}/auth/v1`;
  const options = { issuer, audience: "authenticated" };
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const secret = process.env.SUPABASE_JWT_SECRET;
  const secretKey = secret ? new TextEncoder().encode(secret) : undefined;

  cached = async (token) => {
    const { alg } = decodeProtectedHeader(token);
    if (alg === "HS256") {
      if (!secretKey) throw new Error("HS256 token but SUPABASE_JWT_SECRET is not set");
      return (await jwtVerify(token, secretKey, options)).payload;
    }
    return (await jwtVerify(token, jwks, options)).payload;
  };
  return cached;
}

/** For tests: swap the verifier. */
export function setVerifier(v: Verifier | undefined) {
  cached = v;
}

export const requireUser = createMiddleware<ApiEnv>(async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HTTPException(401, { message: "Sign in required" });

  let payload: JWTPayload;
  try {
    payload = await supabaseVerifier()(token);
  } catch {
    throw new HTTPException(401, { message: "Sign in required" });
  }
  if (typeof payload.sub !== "string") throw new HTTPException(401, { message: "Sign in required" });

  const aal = (payload as { aal?: string }).aal === "aal2" ? "aal2" : "aal1";
  c.set("claims", userClaims(payload.sub, aal));
  await next();
});
