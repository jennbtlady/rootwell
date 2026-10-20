import { Hono } from "hono";
import type { ApiEnv } from "../env";
import { stripeGateway } from "../integrations";
import { receiveStripeEvent } from "../integrations/stripe-events";

/**
 * Webhook receivers. No sign-in: the platform's signature is the proof. Registered before
 * requireUser. The raw body is read as text because signature checks need the exact bytes.
 */
export const webhooks = new Hono<ApiEnv>().post("/stripe", async (c) => {
  const raw = await c.req.text();
  const gw = stripeGateway();
  let event;
  try {
    event = gw.verifyWebhook(raw, c.req.header("stripe-signature") ?? null);
  } catch {
    return c.json({ error: "Signature check failed" }, 400);
  }
  const r = await receiveStripeEvent(gw, event);
  return c.json(r.body, r.status);
});
