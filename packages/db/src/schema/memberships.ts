import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { membershipStatus, orgRole, rowMeta, uuidPk } from "./_shared";
import { organizations } from "./organizations";
import { profiles } from "./profiles";

export const orgMemberships = pgTable(
  "org_memberships",
  {
    id: uuidPk(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Null until an invited person signs up and accepts.
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull(),
    status: membershipStatus("status").notNull().default("invited"),
    invitedEmail: text("invited_email"),
    invitedBy: uuid("invited_by").references(() => profiles.id, { onDelete: "set null" }),
    // sha256 of the invite token. The plain token is only ever in the email link.
    inviteTokenHash: text("invite_token_hash"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...rowMeta,
  },
  (t) => [
    uniqueIndex("org_memberships_org_user_uq").on(t.orgId, t.userId),
    index("org_memberships_user_idx").on(t.userId),
    uniqueIndex("org_memberships_invite_token_uq").on(t.inviteTokenHash),
  ],
);
