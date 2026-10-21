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

/** US time zones offered in the app, with the plain names people use. */
export const US_TIMEZONES = [
  { id: "America/New_York", label: "Eastern" },
  { id: "America/Chicago", label: "Central" },
  { id: "America/Denver", label: "Mountain" },
  { id: "America/Phoenix", label: "Arizona" },
  { id: "America/Los_Angeles", label: "Pacific" },
  { id: "America/Anchorage", label: "Alaska" },
  { id: "Pacific/Honolulu", label: "Hawaii" },
] as const;

const optionalLine = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

/**
 * The organization's own details. The EIN and mailing address appear on every thank-you
 * letter and year-end statement, so donors can claim their gifts.
 */
export const orgProfileInput = z.object({
  name: z.string().trim().min(2, "Name needs at least 2 characters").max(120),
  // An empty box clears the EIN; anything else must look like one.
  ein: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), einSchema.nullable()).default(null),
  address: z
    .object({
      line1: optionalLine(120),
      line2: optionalLine(120),
      city: optionalLine(80),
      state: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^([A-Z]{2})?$/, "Use the two-letter state, like IL")
        .optional()
        .transform((v) => (v ? v : undefined)),
      postalCode: z
        .string()
        .trim()
        .regex(/^(\d{5}(-\d{4})?)?$/, "A ZIP code looks like 62701")
        .optional()
        .transform((v) => (v ? v : undefined)),
    })
    .prefault({}),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  timezone: z.enum(US_TIMEZONES.map((t) => t.id) as [string, ...string[]]),
});
export type OrgProfileInput = z.infer<typeof orgProfileInput>;
