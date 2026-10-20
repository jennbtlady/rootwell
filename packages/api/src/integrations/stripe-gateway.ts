import Stripe from "stripe";

/** What our code needs from Stripe, normalized. Cents throughout. */
export type PaymentInfo = {
  paymentIntentId: string;
  chargeId: string;
  amount: number;
  fee: number;
  net: number;
  created: number;
  email: string | null;
  name: string | null;
  address: { line1: string | null; line2: string | null; city: string | null; state: string | null; postal_code: string | null; country: string | null } | null;
  metadata: Record<string, string>;
};
export type InvoiceInfo = PaymentInfo & { invoiceId: string; subscriptionId: string; customerId: string | null };

export type CheckoutInput = {
  amountCents: number;
  monthly: boolean;
  description: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
};

export interface StripeGateway {
  readonly mode: "live" | "simulated";
  connectUrl(state: string, redirectUri: string): string;
  completeConnect(code: string): Promise<{ accountId: string }>;
  deauthorize(accountId: string): Promise<void>;
  createCheckout(accountId: string, input: CheckoutInput): Promise<{ id: string; url: string }>;
  /** Throws when the signature is wrong. */
  verifyWebhook(rawBody: string, signature: string | null): Stripe.Event;
  paymentDetails(accountId: string, paymentIntentId: string): Promise<PaymentInfo>;
  invoiceDetails(accountId: string, invoiceId: string): Promise<InvoiceInfo>;
  payoutCharges(accountId: string, payoutId: string): Promise<{ chargeId: string; fee: number; amount: number }[]>;
}

function addr(a: Stripe.Address | null | undefined): PaymentInfo["address"] {
  if (!a) return null;
  return { line1: a.line1 ?? null, line2: a.line2 ?? null, city: a.city ?? null, state: a.state ?? null, postal_code: a.postal_code ?? null, country: a.country ?? null };
}

function fromCharge(pi: Stripe.PaymentIntent, ch: Stripe.Charge): PaymentInfo {
  const bt = typeof ch.balance_transaction === "object" && ch.balance_transaction ? ch.balance_transaction : null;
  return {
    paymentIntentId: pi.id,
    chargeId: ch.id,
    amount: ch.amount,
    fee: bt?.fee ?? 0,
    net: bt?.net ?? ch.amount,
    created: ch.created,
    email: ch.billing_details?.email ?? ch.receipt_email ?? null,
    name: ch.billing_details?.name ?? null,
    address: addr(ch.billing_details?.address),
    metadata: { ...(pi.metadata ?? {}) },
  };
}

/** The real thing. Calls run on the nonprofit's connected account via `stripeAccount`. */
export class LiveStripeGateway implements StripeGateway {
  readonly mode = "live" as const;
  private stripe: Stripe;
  constructor(secretKey: string, private clientId: string, private webhookSecret: string) {
    this.stripe = new Stripe(secretKey);
  }
  connectUrl(state: string, redirectUri: string) {
    const q = new URLSearchParams({ response_type: "code", client_id: this.clientId, scope: "read_write", state, redirect_uri: redirectUri });
    return `https://connect.stripe.com/oauth/authorize?${q.toString()}`;
  }
  async completeConnect(code: string) {
    const r = await this.stripe.oauth.token({ grant_type: "authorization_code", code });
    if (!r.stripe_user_id) throw new Error("Stripe did not return an account");
    return { accountId: r.stripe_user_id };
  }
  async deauthorize(accountId: string) {
    await this.stripe.oauth.deauthorize({ client_id: this.clientId, stripe_user_id: accountId });
  }
  async createCheckout(accountId: string, i: CheckoutInput) {
    const s = await this.stripe.checkout.sessions.create(
      {
        mode: i.monthly ? "subscription" : "payment",
        line_items: [
          {
            quantity: 1,
            price_data: { currency: "usd", unit_amount: i.amountCents, product_data: { name: i.description }, ...(i.monthly ? { recurring: { interval: "month" as const } } : {}) },
          },
        ],
        billing_address_collection: "required",
        success_url: i.successUrl,
        cancel_url: i.cancelUrl,
        metadata: i.metadata,
        ...(i.monthly ? { subscription_data: { metadata: i.metadata } } : { payment_intent_data: { metadata: i.metadata }, submit_type: "donate" as const }),
      },
      { stripeAccount: accountId },
    );
    if (!s.url) throw new Error("Stripe did not return a checkout page");
    return { id: s.id, url: s.url };
  }
  verifyWebhook(rawBody: string, signature: string | null) {
    if (!signature) throw new Error("Missing signature");
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
  async paymentDetails(accountId: string, paymentIntentId: string) {
    const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] }, { stripeAccount: accountId });
    const ch = pi.latest_charge;
    if (!ch || typeof ch === "string") throw new Error("Payment has no charge yet");
    return fromCharge(pi, ch);
  }
  async invoiceDetails(accountId: string, invoiceId: string) {
    const inv = await this.stripe.invoices.retrieve(invoiceId, { expand: ["payments.data.payment.payment_intent.latest_charge.balance_transaction"] }, { stripeAccount: accountId });
    const pay = inv.payments?.data.find((p) => p.status === "paid")?.payment;
    const pi = pay?.payment_intent;
    if (!pi || typeof pi === "string") throw new Error("Invoice has no payment");
    const ch = pi.latest_charge;
    if (!ch || typeof ch === "string") throw new Error("Invoice payment has no charge");
    const sub = inv.parent?.subscription_details;
    const subscriptionId = typeof sub?.subscription === "string" ? sub.subscription : (sub?.subscription?.id ?? "");
    const base = fromCharge(pi, ch);
    return {
      ...base,
      email: base.email ?? inv.customer_email ?? null,
      metadata: { ...base.metadata, ...((sub?.metadata as Record<string, string> | null) ?? {}) },
      invoiceId: inv.id ?? invoiceId,
      subscriptionId,
      customerId: typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null),
    };
  }
  async payoutCharges(accountId: string, payoutId: string) {
    const out: { chargeId: string; fee: number; amount: number }[] = [];
    for await (const bt of this.stripe.balanceTransactions.list({ payout: payoutId, type: "charge", limit: 100 }, { stripeAccount: accountId })) {
      const src = typeof bt.source === "string" ? bt.source : bt.source?.id;
      if (src) out.push({ chargeId: src, fee: bt.fee, amount: bt.amount });
    }
    return out;
  }
}

export { NONPROFIT_RATE, grossUpForFee } from "@maple/core";
