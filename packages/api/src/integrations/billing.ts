import { randomBytes } from "node:crypto";
import Stripe from "stripe";

/** Our own subscription (Stripe Billing on the platform account). Not the nonprofit's Stripe. */
export type SubscriptionInfo = { subscriptionId: string; customerId: string | null; status: string; trialEnd: number | null; orgId: string | null };

export interface BillingGateway {
  readonly mode: "live" | "simulated";
  /** A Stripe Checkout page that starts the subscription. Keeps any trial days left. */
  checkoutUrl(i: { orgId: string; orgName: string; customerId: string | null; email: string | null; trialEndsAt: string | null; successUrl: string; cancelUrl: string }): Promise<string>;
  /** Stripe's customer portal: change card, see invoices, cancel. */
  portalUrl(customerId: string, returnUrl: string): Promise<string>;
  subscription(subscriptionId: string): Promise<SubscriptionInfo>;
  verifyWebhook(rawBody: string, signature: string | null): Stripe.Event;
}

const fromSub = (s: Stripe.Subscription): SubscriptionInfo => ({
  subscriptionId: s.id,
  customerId: typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null),
  status: s.status,
  trialEnd: s.trial_end ?? null,
  orgId: s.metadata?.orgId ?? null,
});
export const subscriptionFromEvent = (o: Stripe.Subscription) => fromSub(o);

/** Stripe asks for at least 48 hours of trial left, or none. */
function trialEnd(trialEndsAt: string | null): number | undefined {
  if (!trialEndsAt) return undefined;
  const t = Math.floor(new Date(trialEndsAt).getTime() / 1000);
  return t > Date.now() / 1000 + 48 * 3600 ? t : undefined;
}

export class LiveBillingGateway implements BillingGateway {
  readonly mode = "live" as const;
  private stripe: Stripe;
  constructor(secretKey: string, private priceId: string, private webhookSecret: string) {
    this.stripe = new Stripe(secretKey);
  }
  async checkoutUrl(i: Parameters<BillingGateway["checkoutUrl"]>[0]) {
    const end = trialEnd(i.trialEndsAt);
    const s = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: this.priceId, quantity: 1 }],
      client_reference_id: i.orgId,
      ...(i.customerId ? { customer: i.customerId } : i.email ? { customer_email: i.email } : {}),
      subscription_data: { metadata: { orgId: i.orgId }, ...(end ? { trial_end: end } : {}) },
      metadata: { orgId: i.orgId },
      success_url: i.successUrl,
      cancel_url: i.cancelUrl,
    });
    if (!s.url) throw new Error("Stripe did not return a checkout page");
    return s.url;
  }
  async portalUrl(customerId: string, returnUrl: string) {
    return (await this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl })).url;
  }
  async subscription(id: string) {
    return fromSub(await this.stripe.subscriptions.retrieve(id));
  }
  verifyWebhook(rawBody: string, signature: string | null) {
    if (!signature) throw new Error("Missing signature");
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}

/** In-memory Stripe Billing for test mode. Sends really signed events to our webhook. */
type SimSub = { id: string; customer: string; orgId: string; status: string; trialEnd: number | null };
type SimCheckout = { id: string; orgId: string; orgName: string; customerId: string | null; trialEnd: number | null; successUrl: string; cancelUrl: string; done: boolean };
type BillingSimState = { subs: Map<string, SimSub>; checkouts: Map<string, SimCheckout>; portals: Map<string, { customer: string; returnUrl: string }> };
const g = globalThis as unknown as { __mapleBillingSim?: BillingSimState };
const st: BillingSimState = (g.__mapleBillingSim ??= { subs: new Map(), checkouts: new Map(), portals: new Map() });
const sid = (p: string) => `${p}_sim_${randomBytes(9).toString("base64url")}`;
const signer = new Stripe("sk_test_simulator");

export class SimulatedBillingGateway implements BillingGateway {
  readonly mode = "simulated" as const;
  constructor(
    private webhookSecret: string,
    private baseUrl: () => string,
    private deliver: (body: string, signature: string) => Promise<void> = async (body, signature) => {
      await fetch(`${this.baseUrl()}/api/v1/webhooks/stripe-billing`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body });
    },
  ) {}

  async checkoutUrl(i: Parameters<BillingGateway["checkoutUrl"]>[0]) {
    const c: SimCheckout = { id: sid("cs"), orgId: i.orgId, orgName: i.orgName, customerId: i.customerId, trialEnd: trialEnd(i.trialEndsAt) ?? null, successUrl: i.successUrl, cancelUrl: i.cancelUrl, done: false };
    st.checkouts.set(c.id, c);
    return `${this.baseUrl()}/api/v1/billing-sim/checkout/${c.id}`;
  }
  async portalUrl(customerId: string, returnUrl: string) {
    const id = sid("bps");
    st.portals.set(id, { customer: customerId, returnUrl });
    return `${this.baseUrl()}/api/v1/billing-sim/portal/${id}`;
  }
  async subscription(id: string) {
    const s = st.subs.get(id);
    if (!s) throw new Error("No such subscription");
    return { subscriptionId: s.id, customerId: s.customer, status: s.status, trialEnd: s.trialEnd, orgId: s.orgId };
  }
  verifyWebhook(rawBody: string, signature: string | null) {
    if (!signature) throw new Error("Missing signature");
    return signer.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }

  checkout(id: string) {
    return st.checkouts.get(id) ?? null;
  }
  portal(id: string) {
    const p = st.portals.get(id);
    if (!p) return null;
    const sub = [...st.subs.values()].find((s) => s.customer === p.customer && s.status !== "canceled") ?? null;
    return { ...p, sub };
  }

  /** The owner pays on the simulated checkout page. */
  async pay(checkoutId: string): Promise<string> {
    const c = st.checkouts.get(checkoutId);
    if (!c || c.done) throw new Error("This checkout is finished or does not exist");
    c.done = true;
    const sub: SimSub = { id: sid("sub"), customer: c.customerId ?? sid("cus"), orgId: c.orgId, status: c.trialEnd ? "trialing" : "active", trialEnd: c.trialEnd };
    st.subs.set(sub.id, sub);
    await this.emit("checkout.session.completed", { id: c.id, object: "checkout.session", mode: "subscription", client_reference_id: c.orgId, customer: sub.customer, subscription: sub.id, metadata: { orgId: c.orgId } });
    await this.emit("customer.subscription.created", this.subObject(sub));
    return c.successUrl;
  }

  /** What Stripe does over a subscription's life. */
  async setStatus(subscriptionId: string, status: "active" | "past_due" | "unpaid" | "canceled") {
    const s = st.subs.get(subscriptionId);
    if (!s) throw new Error("No such subscription");
    s.status = status;
    if (status !== "canceled") s.trialEnd = status === "active" ? null : s.trialEnd;
    await this.emit(status === "canceled" ? "customer.subscription.deleted" : "customer.subscription.updated", this.subObject(s));
  }

  private subObject(s: SimSub) {
    return { id: s.id, object: "subscription", customer: s.customer, status: s.status, trial_end: s.trialEnd, metadata: { orgId: s.orgId } };
  }
  private async emit(type: string, object: Record<string, unknown>) {
    const body = JSON.stringify({ id: sid("evt"), object: "event", api_version: "2026-09-30.endive", created: Math.floor(Date.now() / 1000), type, livemode: false, data: { object }, pending_webhooks: 1, request: { id: null, idempotency_key: null } });
    await this.deliver(body, signer.webhooks.generateTestHeaderString({ payload: body, secret: this.webhookSecret }));
  }
}
