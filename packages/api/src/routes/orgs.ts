import { Hono } from "hono";
import { validate } from "../validate";
import { sql } from "drizzle-orm";
import { withRls } from "@maple/db";
import { createOrganizationInput } from "@maple/core";
import type { ApiEnv } from "../env";
import { getDb } from "../db";

export const orgs = new Hono<ApiEnv>()
  .get("/", async (c) => {
    const rows = await withRls(getDb(), c.get("claims"), async (tx) =>
      tx.execute(sql`
        select o.id, o.name, o.fiscal_year_start_month, o.timezone, o.subscription_status, m.role
          from organizations o
          join org_memberships m on m.org_id = o.id and m.user_id = app.uid() and m.status = 'active'
         order by o.name
      `),
    );
    return c.json({
      orgs: rows.map((r) => {
        const x = r as { id: string; name: string; fiscal_year_start_month: number; timezone: string; subscription_status: string; role: string };
        return { id: x.id, name: x.name, fiscalYearStartMonth: x.fiscal_year_start_month, timezone: x.timezone, subscriptionStatus: x.subscription_status, role: x.role };
      }),
    });
  })
  .post("/", validate("json", createOrganizationInput), async (c) => {
    const input = c.req.valid("json");
    const id = await withRls(getDb(), c.get("claims"), async (tx) => {
      const r = await tx.execute(
        sql`select app.create_organization(${input.name}, ${input.fiscalYearStartMonth}, ${input.timezone}) as id`,
      );
      return (r[0] as { id: string }).id;
    });
    return c.json({ id }, 201);
  })
  .get("/:orgId", async (c) => {
    const orgId = c.req.param("orgId");
    const rows = await withRls(getDb(), c.get("claims"), async (tx) =>
      tx.execute(sql`
        select id, name, ein, fiscal_year_start_month, timezone, hide_board_names, sample_org_enabled,
               subscription_status, trial_ends_at
          from organizations where id = ${orgId}
      `),
    );
    const o = rows[0] as
      | { id: string; name: string; ein: string | null; fiscal_year_start_month: number; timezone: string; hide_board_names: boolean; sample_org_enabled: boolean; subscription_status: string; trial_ends_at: string | null }
      | undefined;
    // RLS hides other orgs' rows, so a wrong id and a foreign id look the same: not found.
    if (!o) return c.json({ error: "Not found" }, 404);
    return c.json({
      id: o.id,
      name: o.name,
      ein: o.ein,
      fiscalYearStartMonth: o.fiscal_year_start_month,
      timezone: o.timezone,
      hideBoardNames: o.hide_board_names,
      sampleOrgEnabled: o.sample_org_enabled,
      subscriptionStatus: o.subscription_status,
      trialEndsAt: o.trial_ends_at,
    });
  });
