export type ApiEnv = {
  Variables: {
    claims: import("@maple/core").UserClaims;
  };
  Bindings: Record<string, never>;
};
