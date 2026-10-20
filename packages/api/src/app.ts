import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ApiEnv } from "./env";
import { requireUser } from "./auth";
import { me } from "./routes/me";
import { orgs } from "./routes/orgs";

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
  .onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    // Never echo error details: they can carry row data. Sentry gets the scrubbed event.
    console.error("api error", { path: c.req.path, name: err.name });
    return c.json({ error: "Something went wrong" }, 500);
  });

export type AppType = typeof app;
