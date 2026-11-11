import { Hono } from "hono";
import { z } from "zod";
import { strToU8, zipSync } from "fflate";
import { withRls } from "@maple/db";
import { canExportEverything, exportEverything } from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { requireTwoStep } from "../auth";
import { validate } from "../validate";

const orgParam = z.object({ orgId: z.string().uuid() });

/** The continuity export: every record as spreadsheets in one zip. Works while read only. */
export const accountRoutes = new Hono<ApiEnv>().get("/:orgId/export/everything", requireTwoStep, validate("param", orgParam), async (c) => {
  const { orgId } = c.req.valid("param");
  const out = await withRls(getDb(), c.get("claims"), async (tx) => ((await canExportEverything(tx, orgId)) ? exportEverything(tx, orgId) : null));
  if (!out) return c.json({ error: "Only owners and admins can download everything." }, 403);
  const zip = zipSync(Object.fromEntries(Object.entries(out.files).map(([name, text]) => [name, strToU8(text)])), { level: 6 });
  const day = new Date().toISOString().slice(0, 10);
  return c.body(new Uint8Array(zip), 200, { "content-type": "application/zip", "content-disposition": `attachment; filename="rootwell-export-${day}.zip"` });
});
