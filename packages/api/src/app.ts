import { Hono } from "hono";
import type { ApiEnv } from "./env";
import { requireUser } from "./auth";
import { me } from "./routes/me";
import { orgs } from "./routes/orgs";
import { handleApiError } from "./errors";

/**
 * The whole HTTP API. Mounted in apps/web at /api/v1 and, later, called by apps/mobile
 * through the typed client in ./client.ts. Keep handlers thin: validate, open withRls(),
 * call core, return JSON.
 */
export const app = new Hono<ApiEnv>()
  .basePath("/api/v1")
  .get("/health", (c) => c.json({ ok: true }))
  .use("*", requireUser)
  .route("/me", me)
  .route("/orgs", orgs)
  .onError(handleApiError);

export type AppType = typeof app;
