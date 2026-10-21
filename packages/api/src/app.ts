import { Hono } from "hono";
import type { ApiEnv } from "./env";
import { requireUser } from "./auth";
import { me } from "./routes/me";
import { orgs } from "./routes/orgs";
import { coding } from "./routes/coding";
import { constituents } from "./routes/constituents";
import { giftRoutes } from "./routes/gifts";
import { dedupe } from "./routes/dedupe";
import { imports } from "./routes/imports";
import { reporting } from "./routes/reporting";
import { integrationRoutes } from "./routes/integrations";
import { webhooks } from "./routes/webhooks";
import { publicGive } from "./routes/public-give";
import { stripeSim } from "./routes/stripe-sim";
import { billingRoutes, billingSim, billingWebhook, readOnlyGuard } from "./routes/billing";
import { accountRoutes } from "./routes/account";
import { cronRoutes, trackActivity } from "./routes/cron";
import { handleApiError } from "./errors";

/**
 * The whole HTTP API. Mounted in apps/web at /api/v1 and, later, called by apps/mobile
 * through the typed client in ./client.ts. Keep handlers thin: validate, open withRls(),
 * call core, return JSON.
 */
export const app = new Hono<ApiEnv>()
  .basePath("/api/v1")
  .get("/health", (c) => c.json({ ok: true }))
  // No sign-in: signatures, public pages, and the test-mode Stripe stand-in.
  .route("/webhooks", webhooks)
  .route("/public", publicGive)
  .route("/stripe-sim", stripeSim)
  .route("/webhooks", billingWebhook)
  .route("/billing-sim", billingSim)
  .route("/cron", cronRoutes)
  .use("*", requireUser)
  .use("/orgs/:orgId/*", readOnlyGuard)
  .use("/orgs/:orgId", readOnlyGuard)
  .use("/orgs/:orgId/*", trackActivity)
  .use("/orgs/:orgId", trackActivity)
  .route("/me", me)
  .route("/orgs", orgs)
  .route("/orgs", coding)
  .route("/orgs", constituents)
  .route("/orgs", giftRoutes)
  .route("/orgs", dedupe)
  .route("/orgs", imports)
  .route("/orgs", reporting)
  .route("/orgs", integrationRoutes)
  .route("/orgs", billingRoutes)
  .route("/orgs", accountRoutes)
  .onError(handleApiError);

export type AppType = typeof app;
