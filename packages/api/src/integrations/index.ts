import { LiveMailchimpGateway, SimulatedMailchimpGateway, type MailchimpGateway } from "./mailchimp";
import { LiveStripeGateway, type StripeGateway } from "./stripe-gateway";
import { SimulatedStripeGateway } from "./stripe-sim";
import { LiveBillingGateway, SimulatedBillingGateway, type BillingGateway } from "./billing";
import { randomBytes } from "node:crypto";

export * from "./crypto";
export * from "./mailchimp";
export * from "./stripe-gateway";
export * from "./stripe-sim";
export * from "./billing";
export * from "./turnstile";

let stripeOverride: StripeGateway | undefined;
let stripeCached: StripeGateway | undefined;

/** For tests. */
export function setStripeGateway(g: StripeGateway | undefined) {
  stripeOverride = g;
}

/**
 * Live when STRIPE_SECRET_KEY, STRIPE_CONNECT_CLIENT_ID and STRIPE_CONNECT_WEBHOOK_SECRET are set,
 * simulated otherwise. A production build without all three keys refuses to start Stripe at all:
 * there is no switch that turns the stand-in on in production (launch review, must fix 2).
 */
export function stripeGateway(): StripeGateway {
  if (stripeOverride) return stripeOverride;
  if (stripeCached) return stripeCached;
  const key = process.env.STRIPE_SECRET_KEY;
  const client = process.env.STRIPE_CONNECT_CLIENT_ID;
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (key && client && secret) stripeCached = new LiveStripeGateway(key, client, secret);
  else if (process.env.NODE_ENV === "production") throw new Error("Stripe is not configured");
  else stripeCached = new SimulatedStripeGateway(simSecret(), () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
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
 * STRIPE_WEBHOOK_SECRET are set, simulated otherwise. Never simulated in production.
 */
export function billingGateway(): BillingGateway {
  if (billingOverride) return billingOverride;
  if (billingCached) return billingCached;
  const key = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_ID_STANDARD;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (key && price && secret) billingCached = new LiveBillingGateway(key, price, secret);
  else if (process.env.NODE_ENV === "production") throw new Error("Stripe Billing is not configured");
  else billingCached = new SimulatedBillingGateway(simSecret(), () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  return billingCached;
}

/**
 * The stand-ins sign their own test events. The secret is new for each process, so nobody
 * can read it from the source and forge an event. Only the stand-in in this process both
 * signs and checks it.
 */
function simSecret(): string {
  return `whsec_sim_${randomBytes(24).toString("base64url")}`;
}
