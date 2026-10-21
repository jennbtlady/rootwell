import { Hono } from "hono";
import { z } from "zod";
import { withRls } from "@maple/db";
import { createOrganizationInput, inviteMemberInput, orgProfileInput, setMemberRoleInput, transferOwnershipInput } from "@maple/core";
import {
  createOrg,
  createSampleOrg,
  deleteSampleOrg,
  getOrg,
  inviteMember,
  listMembers,
  listMyOrgs,
  removeMember,
  setMemberRole,
  transferOwnership,
  updateOrgProfile,
} from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { supabaseAdmin } from "../supabase-admin";
import { validate } from "../validate";

const idParam = z.object({ orgId: z.string().uuid() });
const memberParams = z.object({ orgId: z.string().uuid(), memberId: z.string().uuid() });

export const orgs = new Hono<ApiEnv>()
  .get("/", async (c) => {
    const orgs = await withRls(getDb(), c.get("claims"), (tx) => listMyOrgs(tx));
    return c.json({ orgs });
  })
  .post("/", validate("json", createOrganizationInput), async (c) => {
    const input = c.req.valid("json");
    const created = await withRls(getDb(), c.get("claims"), (tx) => createOrg(tx, input));
    return c.json(created, 201);
  })
  .post("/sample", async (c) => {
    const created = await withRls(getDb(), c.get("claims"), (tx) => createSampleOrg(tx));
    return c.json(created, 201);
  })
  .get("/:orgId", validate("param", idParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const org = await withRls(getDb(), c.get("claims"), (tx) => getOrg(tx, orgId));
    // RLS hides other orgs' rows, so a wrong id and a foreign id look the same: not found.
    if (!org) return c.json({ error: "Not found" }, 404);
    return c.json(org);
  })
  // The organization's own details: name, EIN, mailing address, fiscal year, time zone.
  .patch("/:orgId", validate("param", idParam), validate("json", orgProfileInput), async (c) => {
    const { orgId } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => updateOrgProfile(tx, orgId, c.req.valid("json")));
    if (!ok) return c.json({ error: "Only owners and admins can change the organization's details." }, 403);
    return c.json({ ok: true });
  })
  .delete("/:orgId", validate("param", idParam), async (c) => {
    const { orgId } = c.req.valid("param");
    await withRls(getDb(), c.get("claims"), (tx) => deleteSampleOrg(tx, orgId));
    return c.body(null, 204);
  })

  // ---- members
  .get("/:orgId/members", validate("param", idParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const claims = c.get("claims");
    const [org, members] = await withRls(getDb(), claims, async (tx) => [await getOrg(tx, orgId), await listMembers(tx, orgId)] as const);
    if (!org) return c.json({ error: "Not found" }, 404);
    return c.json({ members });
  })
  .post("/:orgId/members", validate("param", idParam), validate("json", inviteMemberInput), async (c) => {
    const { orgId } = c.req.valid("param");
    const input = c.req.valid("json");
    const claims = c.get("claims");
    const result = await withRls(getDb(), claims, (tx) => inviteMember(tx, orgId, input));

    if (result.status === "invited") {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(c.req.url).origin;
      const { error } = await supabaseAdmin().auth.admin.inviteUserByEmail(input.email, {
        redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent("/account/password")}`,
      });
      if (error) {
        await withRls(getDb(), claims, (tx) => removeMember(tx, orgId, result.membershipId));
        return c.json({ error: "We could not send the invitation email. Please try again." }, 502);
      }
    }
    return c.json(result, 201);
  })
  .post("/:orgId/members/:memberId/resend", validate("param", memberParams), async (c) => {
    const { orgId, memberId } = c.req.valid("param");
    const claims = c.get("claims");
    const members = await withRls(getDb(), claims, (tx) => listMembers(tx, orgId));
    const m = members.find((x) => x.id === memberId && x.status === "invited");
    if (!m) return c.json({ error: "Not found" }, 404);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(c.req.url).origin;
    const { error } = await supabaseAdmin().auth.admin.inviteUserByEmail(m.email, {
      redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent("/account/password")}`,
    });
    if (error) return c.json({ error: "We could not send the invitation email. Please try again." }, 502);
    return c.json({ ok: true });
  })
  .patch("/:orgId/members/:memberId", validate("param", memberParams), validate("json", setMemberRoleInput), async (c) => {
    const { orgId, memberId } = c.req.valid("param");
    const { role } = c.req.valid("json");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => setMemberRole(tx, orgId, memberId, role));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  })
  .delete("/:orgId/members/:memberId", validate("param", memberParams), async (c) => {
    const { orgId, memberId } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => removeMember(tx, orgId, memberId));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  })
  .post("/:orgId/transfer-ownership", validate("param", idParam), validate("json", transferOwnershipInput), async (c) => {
    const { orgId } = c.req.valid("param");
    const input = c.req.valid("json");
    await withRls(getDb(), c.get("claims"), (tx) => transferOwnership(tx, orgId, input.toUserId, input.reason));
    return c.json({ ok: true });
  });
