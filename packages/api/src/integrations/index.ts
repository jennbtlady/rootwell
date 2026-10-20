import { LiveMailchimpGateway, SimulatedMailchimpGateway, type MailchimpGateway } from "./mailchimp";
import { LiveStripeGateway, type StripeGateway } from "./stripe-gateway";
import { SimulatedStripeGateway } from "./stripe-sim";
import { LiveBillingGateway, SimulatedBillingGateway, type BillingGateway } from "./billing";

export * from "./crypto";
export * from "./mailchimp";
export * from "./stripe-gateway";
export * from "./stripe-sim";
export * from "./billing";

let stripeOverride: StripeGateway | undefined;
let stripeCached: StripeGateway | undefined;

/** For tests. */
export function setStripeGateway(g: StripeGateway | undefined) {
  stripeOverride = g;
}

/**
 * Live when STRIPE_SECRET_KEY, STRIPE_CONNECT_CLIENT_ID and STRIPE_CONNECT_WEBHOOK_SECRET are set,
 * simulated otherwise (never in production without keys: that is an error).
 */
export function stripeGateway(): StripeGateway {
  if (stripeOverride) return stripeOverride;
  if (stripeCached) return stripeCached;
  const key = process.env.STRIPE_SECRET_KEY;
  const client = process.env.STRIPE_CONNECT_CLIENT_ID;
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (key && client && secret) stripeCached = new LiveStripeGateway(key, client, secret);
  else if (process.env.NODE_ENV === "production" && process.env.STRIPE_MODE !== "simulated") throw new Error("Stripe is not configured");
  else stripeCached = new SimulatedStripeGateway(secret ?? "whsec_simulated_local", () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  return stripeCached;
}

export function mailchimpGateway(apiKey: string): MailchimpGateway {
  return apiKey.startsWith("sim-") && process.env.NODE_ENV !== "production" ? new SimulatedMailchimpGateway(apiKey) : new LiveMailchimpGateway(apiKey);
}

let billingOverride: BillingGateway | undefined;
let billingCached: BillingGateway | undefined;

/** For tests. */
export function setBillingGateway(g: BillingGateway | undefined) {
  billingOverride = g;
}

/**
 * Our own subscription billing. Live when STRIPE_SECRET_KEY, STRIPE_PRICE_ID_STANDARD and
 * STRIPE_WEBHOOK_SECRET are set, simulated otherwise (never in production without keys).
 */
export function billingGateway(): BillingGateway {
  if (billingOverride) return billingOverride;
  if (billingCached) return billingCached;
  const key = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_ID_STANDARD;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (key && price && secret) billingCached = new LiveBillingGateway(key, price, secret);
  else if (process.env.NODE_ENV === "production" && process.env.STRIPE_MODE !== "simulated") throw new Error("Stripe Billing is not configured");
  else billingCached = new SimulatedBillingGateway(secret ?? "whsec_billing_simulated_local", () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  return billingCached;
}
