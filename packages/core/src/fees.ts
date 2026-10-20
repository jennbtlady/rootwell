/** Stripe's nonprofit rate is 2.2% plus 30 cents for most US cards. Used for the cover-the-fee offer. */
export const NONPROFIT_RATE = { percent: 0.022, fixedCents: 30 };

/** The amount that, after the fee, leaves `giftCents` for the nonprofit. */
export function grossUpForFee(giftCents: number, rate = NONPROFIT_RATE): number {
  return Math.ceil((giftCents + rate.fixedCents) / (1 - rate.percent));
}
