import { Hono } from "hono";
import { withRls } from "@maple/db";
import { getMe } from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";

export const me = new Hono<ApiEnv>().get("/", async (c) => {
  const claims = c.get("claims");
  const result = await withRls(getDb(), claims, (tx) => getMe(tx, claims.sub));
  if (!result) return c.json({ error: "Profile not found" }, 404);
  return c.json({ ...result, mfaComplete: claims.aal === "aal2" });
});
