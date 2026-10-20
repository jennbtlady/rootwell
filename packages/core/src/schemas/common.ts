import { z } from "zod";

export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-03-14");
/** Money as a string with up to two decimals, the way Postgres numeric comes back. */
export const money = z
  .union([z.string(), z.number()], { message: "Enter an amount like 25 or 25.50" })
  .transform((v) => (typeof v === "number" ? v.toFixed(2) : v.trim().replace(/[$,]/g, "")))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 25 or 25.50"))
  .transform((v) => Number(v).toFixed(2));
export const positiveMoney = money.refine((v) => Number(v) > 0, "Enter an amount greater than zero");
export const shortText = (max = 200) => z.string().trim().max(max);
export const optionalText = (max = 200) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
