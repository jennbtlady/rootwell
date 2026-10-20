import { z } from "zod";
import { isoDate, money, optionalText, positiveMoney } from "./common";

export const PAYMENT_METHODS = ["check", "cash", "card", "ach", "stock", "in_kind", "other"] as const;
export const GIFT_TYPES = ["one_time", "recurring", "pledge", "pledge_payment", "in_kind", "soft_credit"] as const;

export const PAYMENT_METHOD_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = {
  check: "Check",
  cash: "Cash",
  card: "Card",
  ach: "Bank transfer",
  stock: "Stock",
  in_kind: "In kind",
  other: "Other",
};

export const GIFT_TYPE_LABEL: Record<(typeof GIFT_TYPES)[number], string> = {
  one_time: "One-time gift",
  recurring: "Recurring gift",
  pledge: "Pledge",
  pledge_payment: "Pledge payment",
  in_kind: "In-kind gift",
  soft_credit: "Soft credit",
};

export const giftInput = z.object({
  constituentId: z.string().uuid({ message: "Choose who gave this gift" }),
  batchId: z.string().uuid().nullish(),
  amount: positiveMoney,
  giftDate: isoDate,
  fundId: z.string().uuid({ message: "Choose a fund" }).nullish(),
  campaignId: z.string().uuid().nullish(),
  appealId: z.string().uuid().nullish(),
  paymentMethod: z.enum(PAYMENT_METHODS).default("check"),
  giftType: z.enum(GIFT_TYPES).default("one_time"),
  checkNumber: optionalText(30),
  reference: optionalText(100),
  fairMarketValue: money.nullish(),
  deductibleAmount: money.nullish(),
  notes: z.string().trim().max(2000).nullish(),
  pledgeId: z.string().uuid().nullish(),
  recurringPlanId: z.string().uuid().nullish(),
});
export type GiftInput = z.infer<typeof giftInput>;

export const batchInput = z.object({
  batchDate: isoDate,
  description: optionalText(200),
  expectedTotal: money.nullish(),
  expectedCount: z.coerce.number().int().min(0).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});
export type BatchInput = z.infer<typeof batchInput>;
