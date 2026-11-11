import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from "jose";
import { mfaEnforcementOff, userClaims, withRls } from "@maple/db";
import { secondStepNeeded } from "@maple/core/services";
import type { ApiEnv } from "./env";
import { getDb } from "./db";

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
  const claims = userClaims(payload.sub, aal);
  c.set("claims", claims);

  // Same rule as the /app layout: anyone with an authenticator, and owners and admins of a
  // real organization, must finish the second step before the API serves them. Two calls
  // stay open so a brand-new person can get set up: reading their own profile, and creating
  // their first organization (they hold no role yet, so it exposes nothing).
  if (aal === "aal1" && !mfaEnforcementOff() && !bootstrapCall(c.req.method, c.req.path)) {
    const needed = await withRls(getDb(), claims, (tx) => secondStepNeeded(tx, claims.sub));
    if (needed) throw twoStepRequired();
  }
  await next();
});

function bootstrapCall(method: string, path: string): boolean {
  const p = path.replace(/\/$/, "");
  return (method === "GET" && p === "/api/v1/me") || (method === "POST" && p === "/api/v1/orgs");
}

function twoStepRequired() {
  return new HTTPException(403, {
    res: new Response(
      JSON.stringify({ error: "Finish two-step sign-in first. Sign out and back in with your authenticator app.", code: "two_step_required" }),
      { status: 403, headers: { "content-type": "application/json" } },
    ),
  });
}

/**
 * For downloads and board links: anything that sends many donors' details out in one go.
 * These need two-step sign-in whatever the person's role, so a phished staff password
 * cannot pull the whole donor list.
 */
export const requireTwoStep = createMiddleware<ApiEnv>(async (c, next) => {
  assertTwoStep(c.get("claims").aal);
  await next();
});

/** The same check inline, for a route where only some requests are downloads. */
export function assertTwoStep(aal: string) {
  if (aal === "aal2" || mfaEnforcementOff()) return;
  throw new HTTPException(403, {
    res: new Response(
      JSON.stringify({ error: "Downloads and board links need two-step sign-in. Help, Two-step sign-in and keeping data safe, shows how to set it up in about two minutes.", code: "two_step_required" }),
      { status: 403, headers: { "content-type": "application/json" } },
    ),
  });
}
