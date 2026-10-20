export type ApiEnv = {
  Variables: {
    claims: import("@maple/db").UserClaims;
  };
  Bindings: Record<string, never>;
};
