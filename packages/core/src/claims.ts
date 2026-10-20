/**
 * The identity a database transaction runs as. Mirrors the JWT claims that
 * Postgres RLS policies read through app.jwt(). See packages/db/drizzle/custom/0001_rls.sql.
 */
export type Aal = "aal1" | "aal2";

export type UserClaims = {
  actor: "user";
  /** auth.users.id */
  sub: string;
  role: "authenticated";
  aal: Aal;
};

export type SystemClaims = {
  actor: "system";
  role: "authenticated";
  /** The one organization this job is allowed to touch. */
  org_id: string;
};

export type Claims = UserClaims | SystemClaims;

export function userClaims(sub: string, aal: Aal = "aal1"): UserClaims {
  return { actor: "user", sub, role: "authenticated", aal };
}

export function systemClaims(orgId: string): SystemClaims {
  return { actor: "system", role: "authenticated", org_id: orgId };
}
