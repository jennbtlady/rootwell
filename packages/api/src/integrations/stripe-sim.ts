import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { NONPROFIT_RATE } from "@maple/core";
import { type CheckoutInput, type InvoiceInfo, type PaymentInfo, type StripeGateway } from "./stripe-gateway";

/**
 * A faithful stand-in for Stripe while there are no real keys. It keeps state in memory,
 * charges the nonprofit rate, and sends events signed with the real Stripe signing scheme,
 * so `verifyWebhook` exercises the same code a live webhook does.
 */
type SimCharge = PaymentInfo & { accountId: string; paidOut: boolean; invoiceId?: string; subscriptionId?: string };
type SimSession = { id: string; accountId: string; input: CheckoutInput; done: boolean };

type SimState = { charges: Map<string, SimCharge>; sessions: Map<string, SimSession>; codes: Map<string, string>; needsInfo?: Set<string>; subs: Map<string, { accountId: string; metadata: Record<string, string>; amount: number; email: string | null }>; sent: Stripe.Event[] };
const g = globalThis as unknown as { __mapleStripeSim?: SimState };
const state: SimState = (g.__mapleStripeSim ??= { charges: new Map(), sessions: new Map(), codes: new Map(), subs: new Map(), sent: [] });

const id = (p: string) => `${p}_sim_${randomBytes(9).toString("base64url")}`;
const signer = new Stripe("sk_test_simulator");

export class SimulatedStripeGateway implements StripeGateway {
  readonly mode = "simulated" as const;
  constructor(
    private webhookSecret: string,
    private baseUrl: () => string,
    /** Where events go. Defaults to POSTing to our own webhook route. */
    private deliver: (body: string, signature: string) => Promise<void> = async (body, signature) => {
      await fetch(`${this.baseUrl()}/api/v1/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body });
    },
  ) {}

  connectUrl(st: string, redirectUri: string) {
    return `${this.baseUrl()}/api/v1/stripe-sim/connect?${new URLSearchParams({ state: st, redirect_uri: redirectUri }).toString()}`;
  }
  /**
   * The simulator's consent page calls this, then redirects back with the code. With
   * `needsInfo`, the account connects but cannot take payments until its setup is finished on
   * the simulator's account page, like a Standard account that still owes Stripe details.
   */
  issueCode(needsInfo = false): string {
    const code = id("ac");
    const acct = id("acct");
    state.codes.set(code, acct);
    if (needsInfo) (state.needsInfo ??= new Set()).add(acct);
    return code;
  }
  async accountStatus(accountId: string) {
    return { ready: !state.needsInfo?.has(accountId), dashboardUrl: `${this.baseUrl()}/api/v1/stripe-sim/account/${accountId}` };
  }
  /** The simulator's account page: finish setup, then tell Rootwell the way Stripe would. */
  async finishAccountSetup(accountId: string) {
    state.needsInfo?.delete(accountId);
    await this.emit(accountId, "account.updated", { id: accountId, object: "account", charges_enabled: true, details_submitted: true });
  }
  async completeConnect(code: string) {
    const acct = state.codes.get(code);
    if (!acct) throw new Error("That connection code is not valid");
    state.codes.delete(code);
    return { accountId: acct };
  }
  async deauthorize() {}

  async createCheckout(accountId: string, input: CheckoutInput) {
    const s: SimSession = { id: id("cs"), accountId, input, done: false };
    state.sessions.set(s.id, s);
    return { id: s.id, url: `${this.baseUrl()}/api/v1/stripe-sim/checkout/${s.id}` };
  }
  session(sessionId: string) {
    return state.sessions.get(sessionId) ?? null;
  }

  verifyWebhook(rawBody: string, signature: string | null): Stripe.Event {
    if (!signature) throw new Error("Missing signature");
    return signer.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }

  async paymentDetails(accountId: string, paymentIntentId: string) {
    const c = [...state.charges.values()].find((x) => x.paymentIntentId === paymentIntentId && x.accountId === accountId);
    if (!c) throw new Error("No such payment");
    return c;
  }
  async invoiceDetails(accountId: string, invoiceId: string): Promise<InvoiceInfo> {
    const c = [...state.charges.values()].find((x) => x.invoiceId === invoiceId && x.accountId === accountId);
    if (!c || !c.subscriptionId) throw new Error("No such invoice");
    return { ...c, invoiceId, subscriptionId: c.subscriptionId, customerId: null };
  }
  async payoutCharges(accountId: string, payoutId: string) {
    return [...state.charges.values()].filter((c) => c.accountId === accountId && (c as SimCharge & { payoutId?: string }).payoutId === payoutId).map((c) => ({ chargeId: c.chargeId, fee: c.fee, amount: c.amount }));
  }

  // ---- what a donor or Stripe would do

  /** The donor pays on the simulated checkout page. Sends the same events Stripe would. */
  async pay(sessionId: string, donor: { name: string; email: string; address: NonNullable<PaymentInfo["address"]> }): Promise<void> {
    const s = state.sessions.get(sessionId);
    if (!s || s.done) throw new Error("This checkout is finished or does not exist");
    s.done = true;
    if (s.input.monthly) {
      const subscriptionId = id("sub");
      state.subs.set(subscriptionId, { accountId: s.accountId, metadata: s.input.metadata, amount: s.input.amountCents, email: donor.email });
      await this.emit(s.accountId, "checkout.session.completed", { id: s.id, object: "checkout.session", mode: "subscription", amount_total: s.input.amountCents, subscription: subscriptionId, payment_intent: null, metadata: s.input.metadata, customer_details: { email: donor.email, name: donor.name, address: donor.address } });
      await this.chargeSubscription(subscriptionId, donor);
    } else {
      const c = this.charge(s.accountId, s.input.amountCents, s.input.metadata, donor);
      await this.emit(s.accountId, "checkout.session.completed", { id: s.id, object: "checkout.session", mode: "payment", amount_total: s.input.amountCents, payment_intent: c.paymentIntentId, subscription: null, metadata: s.input.metadata, customer_details: { email: donor.email, name: donor.name, address: donor.address } });
    }
  }

  /** A later month's charge on a subscription. */
  async chargeSubscription(subscriptionId: string, donor?: { name: string; email: string; address: NonNullable<PaymentInfo["address"]> }): Promise<void> {
    const sub = state.subs.get(subscriptionId);
    if (!sub) throw new Error("No such subscription");
    const c = this.charge(sub.accountId, sub.amount, sub.metadata, donor ?? { name: "", email: sub.email ?? "", address: { line1: null, line2: null, city: null, state: null, postal_code: null, country: null } });
    c.invoiceId = id("in");
    c.subscriptionId = subscriptionId;
    await this.emit(sub.accountId, "invoice.paid", { id: c.invoiceId, object: "invoice", amount_paid: c.amount, customer_email: c.email, parent: { subscription_details: { subscription: subscriptionId, metadata: sub.metadata } } });
  }

  /** Stripe pays the account out: every charge not yet paid out goes in one payout. */
  async payout(accountId: string): Promise<{ payoutId: string; amount: number }> {
    const payoutId = id("po");
    let amount = 0;
    for (const c of state.charges.values()) {
      if (c.accountId === accountId && !c.paidOut) {
        c.paidOut = true;
        (c as SimCharge & { payoutId?: string }).payoutId = payoutId;
        amount += c.net;
      }
    }
    await this.emit(accountId, "payout.paid", { id: payoutId, object: "payout", amount, arrival_date: Math.floor(Date.now() / 1000), status: "paid" });
    return { payoutId, amount };
  }

  async refund(accountId: string, chargeId: string) {
    const c = state.charges.get(chargeId);
    if (!c) throw new Error("No such charge");
    await this.emit(accountId, "charge.refunded", { id: chargeId, object: "charge", amount: c.amount, amount_refunded: c.amount, payment_intent: c.paymentIntentId, billing_details: { name: c.name, email: c.email } });
  }

  async cancelSubscription(subscriptionId: string) {
    const sub = state.subs.get(subscriptionId);
    if (!sub) throw new Error("No such subscription");
    await this.emit(sub.accountId, "customer.subscription.deleted", { id: subscriptionId, object: "subscription", status: "canceled", metadata: sub.metadata });
  }

  private charge(accountId: string, amount: number, metadata: Record<string, string>, donor: { name: string; email: string; address: NonNullable<PaymentInfo["address"]> }): SimCharge {
    const fee = Math.round(amount * NONPROFIT_RATE.percent) + NONPROFIT_RATE.fixedCents;
    const c: SimCharge = {
      accountId, paidOut: false, paymentIntentId: id("pi"), chargeId: id("ch"), amount, fee, net: amount - fee, created: Math.floor(Date.now() / 1000),
      email: donor.email || null, name: donor.name || null, address: donor.address, metadata: { ...metadata },
    };
    state.charges.set(c.chargeId, c);
    return c;
  }

  private async emit(accountId: string, type: string, object: Record<string, unknown>) {
    const event = { id: id("evt"), object: "event", api_version: "2026-09-30.endive", account: accountId, created: Math.floor(Date.now() / 1000), type, livemode: false, data: { object }, pending_webhooks: 1, request: { id: null, idempotency_key: null } };
    const body = JSON.stringify(event);
    const signature = signer.webhooks.generateTestHeaderString({ payload: body, secret: this.webhookSecret });
    state.sent.push(event as unknown as Stripe.Event);
    await this.deliver(body, signature);
  }
}
