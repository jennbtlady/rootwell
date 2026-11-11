import { Hono } from "hono";
import { z } from "zod";
import { withPublic } from "@maple/db";
import { checkoutRequest } from "@maple/core";
import { hitRateLimit, publicDonationPage, RATE_LIMITS } from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { validate } from "../validate";
import { grossUpForFee, stripeGateway, TurnstileNotConfigured, turnstileVerifier } from "../integrations";
import { clientIp, tooManyRequests, visitorKey } from "../rate-limit";

const slugParam = z.object({ slug: z.string().min(3).max(50) });

/** The public giving page. No sign-in. Knows only what app.public_donation_page returns. */
export const publicGive = new Hono<ApiEnv>()
  .get("/give/:slug", validate("param", slugParam), async (c) => {
    const page = await withPublic(getDb(), (tx) => publicDonationPage(tx, c.req.valid("param").slug));
    if (!page) return c.json({ error: "This giving page does not exist or is turned off." }, 404);
    const { stripeAccount, orgId: _o, ...rest } = page;
    return c.json({ ...rest, takingGifts: !!stripeAccount, simulated: stripeGateway().mode === "simulated" });
  })
  .post("/give/:slug/checkout", validate("param", slugParam), validate("json", checkoutRequest), async (c) => {
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");

    // Card-testing protection, before anything reaches Stripe: limits per visitor and per
    // page, then the bot check (launch review, must fix 3).
    const ip = clientIp((n) => c.req.header(n));
    const limited = await withPublic(getDb(), async (tx) => {
      if (!(await hitRateLimit(tx, "checkoutVisitor", visitorKey(ip)))) return RATE_LIMITS.checkoutVisitor.windowSeconds;
      if (!(await hitRateLimit(tx, "checkoutPage", slug))) return RATE_LIMITS.checkoutPage.windowSeconds;
      return 0;
    });
    if (limited) return tooManyRequests(c, limited);
    let human: boolean;
    try {
      human = await turnstileVerifier()(body.botCheck, ip);
    } catch (e) {
      if (e instanceof TurnstileNotConfigured) return c.json({ error: "Online giving is paused for a moment. Please try again later." }, 503);
      throw e;
    }
    if (!human) return c.json({ error: "The security check did not finish. Please wait a moment and press Give again.", code: "bot_check_failed" }, 400);

    const page = await withPublic(getDb(), (tx) => publicDonationPage(tx, slug));
    if (!page) return c.json({ error: "This giving page does not exist or is turned off." }, 404);
    if (!page.stripeAccount) return c.json({ error: "This page is not taking gifts yet." }, 409);
    const gw = stripeGateway();
    if (page.sample && gw.mode === "live") return c.json({ error: "The sample organization cannot take real gifts." }, 409);

    const fund = body.fundId ? page.funds.find((f) => f.id === body.fundId) : page.funds[0];
    if (body.fundId && !fund) return c.json({ error: "Choose one of the funds on this page." }, 400);
    const monthly = body.monthly && page.allowMonthly;
    const giftCents = Math.round(body.amount * 100);
    const totalCents = body.coverFee && page.offerCoverFees ? grossUpForFee(giftCents) : giftCents;

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(c.req.url).origin;
    const s = await gw.createCheckout(page.stripeAccount, {
      amountCents: totalCents,
      monthly,
      description: `${monthly ? "Monthly gift" : "Gift"} to ${page.orgName}${fund ? `: ${fund.name}` : ""}`,
      successUrl: `${origin}/give/${slug}/thanks?session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/give/${slug}`,
      metadata: {
        orgId: page.orgId,
        pageId: page.id,
        fundId: fund?.id ?? "",
        campaignId: page.campaignId ?? "",
        giftCents: String(giftCents),
        coverFeeCents: String(totalCents - giftCents),
      },
    });
    return c.json({ url: s.url });
  });
