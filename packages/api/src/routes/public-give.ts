import { Hono } from "hono";
import { z } from "zod";
import { withPublic } from "@maple/db";
import { checkoutRequest } from "@maple/core";
import { systemClaims, withRls } from "@maple/db";
import { alertRecipients, hitRateLimit, monthlyGiftForManage, publicDonationPage, RATE_LIMITS } from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { validate } from "../validate";
import { grossUpForFee, stripeGateway, TurnstileNotConfigured, turnstileVerifier, verifyManageLink } from "../integrations";
import { getMailer, textToHtml } from "../email/mailer";
import { clientIp, tooManyRequests, visitorKey } from "../rate-limit";

const slugParam = z.object({ slug: z.string().min(3).max(50) });
const tokenParam = z.object({ token: z.string().min(20).max(400) });

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
      if (!(await hitRateLimit(tx, "checkoutPage", slug))) return -RATE_LIMITS.checkoutPage.windowSeconds;
      return 0;
    });
    if (limited < 0) await warnAboutSpike(slug);
    if (limited) return tooManyRequests(c, Math.abs(limited));
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
    const animal = body.animalId ? page.animals.find((a) => a.id === body.animalId) : null;
    if (body.animalId && !animal) return c.json({ error: "Choose one of the animals on this page." }, 400);
    const tribute = page.allowTribute ? body.tribute : null;
    const message = page.allowMessage ? body.message : null;
    const monthly = body.monthly && page.allowMonthly;
    const giftCents = Math.round(body.amount * 100);
    const totalCents = body.coverFee && page.offerCoverFees ? grossUpForFee(giftCents) : giftCents;

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(c.req.url).origin;
    const s = await gw.createCheckout(page.stripeAccount, {
      amountCents: totalCents,
      monthly,
      description: `${monthly ? "Monthly gift" : "Gift"} to ${page.orgName}${animal ? `: sponsor ${animal.name}` : fund ? `: ${fund.name}` : ""}`,
      successUrl: `${origin}/give/${slug}/thanks?session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/give/${slug}`,
      metadata: {
        orgId: page.orgId,
        pageId: page.id,
        fundId: fund?.id ?? "",
        campaignId: page.campaignId ?? "",
        giftCents: String(giftCents),
        coverFeeCents: String(totalCents - giftCents),
        // Fundraising Phase 2. Stripe allows 500 characters per value; the form limits match.
        ...(animal ? { animalId: animal.id } : {}),
        ...(message ? { message } : {}),
        ...(tribute
          ? { tributeKind: tribute.kind, tributeName: tribute.honoreeName, ...(tribute.notifyName ? { tributeNotifyName: tribute.notifyName } : {}), ...(tribute.notifyEmail ? { tributeNotifyEmail: tribute.notifyEmail } : {}) }
          : {}),
      },
    });
    return c.json({ url: s.url });
  })

  // ---- a monthly donor's private link (fundraising Phase 2). No account needed: the link
  // itself is signed. Opening it shows the gift; only pressing the button goes to Stripe, so
  // an email scanner that follows links changes nothing.
  .get("/manage/:token", validate("param", tokenParam), async (c) => {
    const found = await managed(c.req.valid("param").token, (n) => c.req.header(n));
    if (found === "limited") return tooManyRequests(c, RATE_LIMITS.manageVisitor.windowSeconds);
    if (!found) return c.json({ error: "This link has expired or is not right. Use the link in your most recent receipt." }, 404);
    const { gift } = found;
    return c.json({ orgName: gift.orgName, amount: gift.amount, designation: gift.designation, status: gift.status, branding: gift.branding, logoPath: gift.logoPath });
  })
  .post("/manage/:token", validate("param", tokenParam), async (c) => {
    const { token } = c.req.valid("param");
    const found = await managed(token, (n) => c.req.header(n));
    if (found === "limited") return tooManyRequests(c, RATE_LIMITS.manageVisitor.windowSeconds);
    if (!found) return c.json({ error: "This link has expired or is not right. Use the link in your most recent receipt." }, 404);
    if (found.gift.status === "ended") return c.json({ error: "This monthly gift has already stopped." }, 409);
    if (!found.gift.stripeAccount) return c.json({ error: "This organization is not taking online gifts right now. Please contact them." }, 409);
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(c.req.url).origin;
    const url = await stripeGateway().manageSubscriptionUrl(found.gift.stripeAccount, found.subscriptionId, `${origin}/manage/${token}`);
    return c.json({ url });
  });

async function managed(token: string, header: (name: string) => string | undefined) {
  const ip = clientIp(header);
  if (!(await withPublic(getDb(), (tx) => hitRateLimit(tx, "manageVisitor", visitorKey(ip))))) return "limited" as const;
  const link = verifyManageLink(token);
  if (!link) return null;
  const gift = await withRls(getDb(), systemClaims(link.orgId), (tx) => monthlyGiftForManage(tx, link.orgId, link.subscriptionId));
  return gift ? { gift, subscriptionId: link.subscriptionId } : null;
}

/**
 * A giving page hit its limit on checkouts: maybe a busy night, maybe someone testing stolen
 * cards. Warn the organization's owners and admins, at most once in six hours per page. Never
 * fails the request.
 */
async function warnAboutSpike(slug: string): Promise<void> {
  try {
    const page = await withPublic(getDb(), (tx) => publicDonationPage(tx, slug));
    if (!page) return;
    if (!(await withPublic(getDb(), (tx) => hitRateLimit(tx, "spikeAlertPage", slug)))) return;
    const people = await withRls(getDb(), systemClaims(page.orgId), (tx) => alertRecipients(tx, page.orgId));
    const { limit, windowSeconds } = RATE_LIMITS.checkoutPage;
    const text = [
      `Your giving page "${page.title}" had more than ${limit} checkouts started in ${windowSeconds / 60} minutes, so Rootwell is slowing it down for a few minutes.`,
      "This can be a busy event night. It can also be someone testing stolen card numbers.",
      "Please look at your recent payments in Stripe. If you see many small or failed payments you do not recognize, turn on Stripe Radar's card testing rules, or turn the giving page off in Rootwell until it settles.",
      "Rootwell sends this warning at most once every six hours for each page.",
    ].join("\n\n");
    const mailer = getMailer();
    for (const p of people) {
      await mailer.send({ to: p.email, subject: `Unusual activity on your giving page "${page.title}"`, text, html: textToHtml(text) }).catch(() => undefined);
    }
  } catch {
    // A warning that cannot be sent must not stop the page from answering.
  }
}
