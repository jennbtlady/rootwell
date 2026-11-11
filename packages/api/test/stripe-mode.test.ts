import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Launch review, must fix 2: the Stripe stand-ins must never run in production. Each test
 * loads the module fresh, because the gateways are cached once chosen.
 */
const KEYS = ["STRIPE_SECRET_KEY", "STRIPE_CONNECT_CLIENT_ID", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_PRICE_ID_STANDARD", "STRIPE_WEBHOOK_SECRET"];

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const k of KEYS) vi.stubEnv(k, "");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("../src/integrations");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Stripe stand-ins", () => {
  it("refuse to start in production without keys, even when asked to", async () => {
    const m = await load({ NODE_ENV: "production", STRIPE_MODE: "simulated" });
    expect(() => m.stripeGateway()).toThrow("Stripe is not configured");
    expect(() => m.billingGateway()).toThrow("Stripe Billing is not configured");
  });

  it("run outside production, each with its own signing secret", async () => {
    const a = await load({ NODE_ENV: "development" });
    const b = await load({ NODE_ENV: "development" });
    const ga = a.stripeGateway();
    const gb = b.stripeGateway();
    expect(ga.mode).toBe("simulated");
    expect(a.billingGateway().mode).toBe("simulated");
    const secretOf = (g: unknown) => JSON.stringify(g).match(/whsec_[A-Za-z0-9_-]+/)?.[0];
    expect(secretOf(ga)).toBeTruthy();
    expect(secretOf(ga)).not.toBe(secretOf(gb));
    expect(secretOf(ga)).not.toContain("local");
  });
});
