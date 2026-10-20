import { Hono } from "hono";
import { withRls } from "@maple/db";
import { createOrganizationInput } from "@maple/core";
import { createOrg, getOrg, listMyOrgs } from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { validate } from "../validate";

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
  .get("/:orgId", async (c) => {
    const org = await withRls(getDb(), c.get("claims"), (tx) => getOrg(tx, c.req.param("orgId")));
    // RLS hides other orgs' rows, so a wrong id and a foreign id look the same: not found.
    if (!org) return c.json({ error: "Not found" }, 404);
    return c.json(org);
  });
