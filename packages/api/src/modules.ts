import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { withRls } from "@maple/db";
import type { ModuleKey } from "@maple/core";
import { orgHasModule } from "@maple/core/services";
import type { ApiEnv } from "./env";
import { getDb } from "./db";

/**
 * Refuses a call when the organization does not have the module (fundraising Phase 1). The
 * screens hide what an organization does not have; this makes the API agree. Refusals carry
 * code "module_off".
 */
export function requireModule(module: ModuleKey) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const orgId = c.req.param("orgId");
    if (orgId) {
      const ok = await withRls(getDb(), c.get("claims"), (tx) => orgHasModule(tx, orgId, module));
      if (!ok) {
        throw new HTTPException(403, {
          res: new Response(JSON.stringify({ error: "Your organization does not have this part of Rootwell turned on.", code: "module_off" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
        });
      }
    }
    await next();
  });
}
