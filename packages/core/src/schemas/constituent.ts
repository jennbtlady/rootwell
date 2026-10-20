import { z } from "zod";
import { isoDate, optionalText, shortText } from "./common";

export const CONSTITUENT_TYPES = ["person", "household", "organization"] as const;
export const CONTACT_POINT_TYPES = ["home", "work", "mobile", "mailing", "other"] as const;

export const emailInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter an email like name@example.org"),
  type: z.enum(CONTACT_POINT_TYPES).default("home"),
  isPrimary: z.boolean().default(false),
});
export const phoneInput = z.object({
  phone: shortText(40).min(7, "Enter a phone number with area code"),
  type: z.enum(CONTACT_POINT_TYPES).default("mobile"),
  isPrimary: z.boolean().default(false),
});
export const addressInput = z.object({
  line1: optionalText(200),
  line2: optionalText(200),
  city: optionalText(100),
  state: optionalText(50),
  postalCode: optionalText(20),
  country: shortText(2).default("US"),
  type: z.enum(CONTACT_POINT_TYPES).default("home"),
  isPrimary: z.boolean().default(false),
});

const customFields = z
  .record(z.string().max(60), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
  .refine((o) => Object.keys(o).length <= 20, "At most 20 custom fields")
  .default({});

export const constituentInput = z
  .object({
    type: z.enum(CONSTITUENT_TYPES).default("person"),
    prefix: optionalText(20),
    firstName: optionalText(80),
    middleName: optionalText(80),
    lastName: optionalText(80),
    suffix: optionalText(20),
    preferredName: optionalText(80),
    orgName: optionalText(200),
    doNotContact: z.boolean().default(false),
    doNotEmail: z.boolean().default(false),
    doNotMail: z.boolean().default(false),
    doNotCall: z.boolean().default(false),
    deceased: z.boolean().default(false),
    deceasedOn: isoDate.nullish(),
    source: optionalText(100),
    assignedTo: z.string().uuid().nullish(),
    notes: z.string().trim().max(5000).nullish(),
    customFields,
    emails: z.array(emailInput).max(10).default([]),
    phones: z.array(phoneInput).max(10).default([]),
    addresses: z.array(addressInput).max(10).default([]),
  })
  .superRefine((c, ctx) => {
    if (c.type === "person" && !c.firstName && !c.lastName) {
      ctx.addIssue({ code: "custom", path: ["lastName"], message: "Enter a first or last name" });
    }
    if (c.type !== "person" && !c.orgName) {
      ctx.addIssue({ code: "custom", path: ["orgName"], message: c.type === "household" ? "Enter the household name" : "Enter the organization name" });
    }
    for (const key of ["emails", "phones", "addresses"] as const) {
      if (c[key].filter((x) => x.isPrimary).length > 1) ctx.addIssue({ code: "custom", path: [key], message: "Only one can be primary" });
    }
  });
export type ConstituentInput = z.infer<typeof constituentInput>;

export const constituentSearch = z.object({
  q: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const RELATIONSHIP_TYPES: { type: string; reciprocal: string; label: string }[] = [
  { type: "spouse", reciprocal: "spouse", label: "Spouse or partner" },
  { type: "parent", reciprocal: "child", label: "Parent" },
  { type: "child", reciprocal: "parent", label: "Child" },
  { type: "sibling", reciprocal: "sibling", label: "Sibling" },
  { type: "household_member", reciprocal: "household", label: "Member of household" },
  { type: "employee", reciprocal: "employer", label: "Employee" },
  { type: "employer", reciprocal: "employee", label: "Employer" },
  { type: "board_member", reciprocal: "board", label: "Board member" },
  { type: "volunteer", reciprocal: "volunteer_org", label: "Volunteer" },
  { type: "friend", reciprocal: "friend", label: "Friend" },
  { type: "other", reciprocal: "other", label: "Other" },
];

export const relationshipInput = z.object({
  toConstituentId: z.string().uuid(),
  type: shortText(40).min(1),
  reciprocalType: optionalText(40),
  notes: optionalText(500),
});
export type RelationshipInput = z.infer<typeof relationshipInput>;

export const INTERACTION_TYPES = ["call", "meeting", "email", "letter", "event", "note", "other"] as const;
export const interactionInput = z.object({
  type: z.enum(INTERACTION_TYPES).default("note"),
  occurredOn: isoDate,
  summary: shortText(200).min(1, "Write a short summary"),
  details: z.string().trim().max(5000).nullish(),
  ownerId: z.string().uuid().nullish(),
});
export type InteractionInput = z.infer<typeof interactionInput>;

export const tagInput = z.object({ name: shortText(50).min(1, "Give the tag a name") });
