import { Hono } from "hono";
import type { ApiEnv } from "../env";
import { SimulatedStripeGateway, stripeGateway } from "../integrations";

/**
 * Pages that stand in for Stripe's own screens while there are no real keys.
 * They exist only in simulated mode and say so on every screen.
 */
const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f4f4f6;color:#121c2d;line-height:1.5}
  main{max-width:28rem;margin:2rem auto;padding:1.5rem;background:#fff;border-radius:8px;border:1px solid #cacdd8}
  .banner{background:#fef5ee;border:1px solid #f47c22;padding:.5rem .75rem;border-radius:4px;font-size:.875rem;margin-bottom:1rem}
  label{display:block;font-weight:600;margin-top:.75rem;font-size:.875rem}
  input{width:100%;box-sizing:border-box;padding:.5rem;border:1px solid #8891aa;border-radius:4px;font-size:1rem}
  button{margin-top:1.25rem;width:100%;padding:.75rem;font-size:1rem;font-weight:600;background:#0263e0;color:#fff;border:0;border-radius:4px;cursor:pointer}
  button:focus-visible,input:focus-visible{outline:3px solid #0263e0;outline-offset:2px}
  .row{display:flex;gap:.5rem}.row>div{flex:1}
</style></head><body><main>
<p class="banner"><strong>Test mode.</strong> This is a stand-in for Stripe. No real card is charged.</p>
${body}
</main></body></html>`;

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function sim(): SimulatedStripeGateway | null {
  const g = stripeGateway();
  return g instanceof SimulatedStripeGateway ? g : null;
}

export const stripeSim = new Hono<ApiEnv>()
  .use("*", async (c, next) => {
    if (!sim()) return c.notFound();
    await next();
  })
  .get("/connect", (c) => {
    const state = c.req.query("state") ?? "";
    const redirect = c.req.query("redirect_uri") ?? "";
    return c.html(
      page(
        "Connect your Stripe account",
        `<h1>Connect your Stripe account</h1>
<p>Rootwell is asking to take donations into your Stripe account and read the payments and deposits it makes.</p>
<form method="post" action="/api/v1/stripe-sim/connect">
  <input type="hidden" name="state" value="${esc(state)}"><input type="hidden" name="redirect_uri" value="${esc(redirect)}">
  <button type="submit">Connect test account</button>
  <button type="submit" name="needs_info" value="1" style="background:#fff;color:#0263e0;border:1px solid #0263e0">Connect a test account that still needs details</button>
</form>`,
      ),
    );
  })
  .post("/connect", async (c) => {
    const form = await c.req.formData();
    const redirect = String(form.get("redirect_uri") ?? "");
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(c.req.url).origin;
    // Only ever send people back to this app.
    if (!redirect.startsWith(`${origin}/`)) return c.text("That return address is not allowed.", 400);
    const code = sim()!.issueCode(form.get("needs_info") === "1");
    const u = new URL(redirect);
    u.searchParams.set("code", code);
    u.searchParams.set("state", String(form.get("state") ?? ""));
    return c.redirect(u.toString(), 303);
  })
  // Stands in for a Standard account's own Stripe dashboard, where its owner finishes setup.
  .get("/account/:id", (c) => {
    const acct = c.req.param("id");
    return c.html(
      page(
        "Finish your Stripe account",
        `<h1>Finish your Stripe account</h1>
<p>Stripe needs a few more details (bank account and identity) before this account can take payments.</p>
<form method="post" action="/api/v1/stripe-sim/account/${esc(acct)}">
  <button type="submit">Finish account setup</button>
</form>`,
      ),
    );
  })
  .post("/account/:id", async (c) => {
    await sim()!.finishAccountSetup(c.req.param("id"));
    return c.html(page("Account ready", "<h1>Your account is ready</h1><p>Go back to Rootwell. Your Stripe connection now says Connected.</p>"));
  })
  .get("/checkout/:id", (c) => {
    const s = sim()!.session(c.req.param("id"));
    if (!s || s.done) return c.html(page("Checkout finished", "<h1>This checkout is finished</h1><p>Go back and start again.</p>"), 404);
    const amount = (s.input.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    return c.html(
      page(
        "Pay",
        `<h1>${esc(s.input.description)}</h1>
<p><strong>${amount}</strong>${s.input.monthly ? " every month" : ""}</p>
<form method="post" action="/api/v1/stripe-sim/checkout/${esc(s.id)}">
  <label for="name">Name on card</label><input id="name" name="name" autocomplete="name" required>
  <label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required>
  <label for="line1">Street address</label><input id="line1" name="line1" autocomplete="address-line1" required>
  <div class="row">
    <div><label for="city">City</label><input id="city" name="city" autocomplete="address-level2" required></div>
    <div><label for="state">State</label><input id="state" name="state" autocomplete="address-level1" required maxlength="2"></div>
  </div>
  <label for="postal">ZIP code</label><input id="postal" name="postal" autocomplete="postal-code" required inputmode="numeric">
  <label for="card">Card number</label><input id="card" name="card" value="4242 4242 4242 4242" readonly aria-describedby="card-help">
  <p id="card-help" style="font-size:.875rem;margin:.25rem 0 0">Test card. Nothing is charged.</p>
  <button type="submit">Pay ${amount}</button>
</form>
<p><a href="${esc(s.input.cancelUrl)}">Cancel and go back</a></p>`,
      ),
    );
  })
  .post("/checkout/:id", async (c) => {
    const g = sim()!;
    const s = g.session(c.req.param("id"));
    if (!s || s.done) return c.html(page("Checkout finished", "<h1>This checkout is finished</h1>"), 404);
    const f = await c.req.formData();
    const v = (k: string) => String(f.get(k) ?? "").trim();
    await g.pay(s.id, { name: v("name"), email: v("email"), address: { line1: v("line1"), line2: null, city: v("city"), state: v("state").toUpperCase(), postal_code: v("postal"), country: "US" } });
    return c.redirect(s.input.successUrl.replace("{CHECKOUT_SESSION_ID}", s.id), 303);
  });
