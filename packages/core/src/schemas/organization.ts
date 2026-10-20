import { z } from "zod";

export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export const createOrganizationInput = z.object({
  name: z.string().trim().min(2, "Name needs at least 2 characters").max(120),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
  timezone: z.string().min(1).default("America/New_York"),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationInput>;

export const einSchema = z
  .string()
  .trim()
  .regex(/^\d{2}-?\d{7}$/, "An EIN looks like 12-3456789")
  .transform((v) => (v.includes("-") ? v : `${v.slice(0, 2)}-${v.slice(2)}`));

export const updateOrganizationInput = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  ein: einSchema.nullable().optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
  timezone: z.string().min(1).optional(),
  hideBoardNames: z.boolean().optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationInput>;
