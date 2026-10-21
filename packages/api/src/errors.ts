import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

type Reporter = (err: Error, where: { path: string; method: string }) => void;
let reporter: Reporter | undefined;

/**
 * The web app plugs error reporting in here (Sentry, scrubbed). packages/api does not depend
 * on any reporting service, and nothing is reported when none is set.
 */
export function setErrorReporter(r: Reporter | undefined) {
  reporter = r;
}

/** Postgres error code, whether the driver threw it directly or Drizzle wrapped it. */
export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

/**
 * Maps database refusals to HTTP without echoing the database message.
 * 42501 is "insufficient privilege": every RLS policy and permission check raises it.
 */
export function handleApiError(err: Error, c: Context) {
  if (err instanceof HTTPException) return err.getResponse();
  switch (pgCode(err)) {
    case "42501":
      return c.json({ error: "You do not have permission to do that." }, 403);
    case "23505":
      return c.json({ error: "That person is already a member or has a pending invitation." }, 409);
    case "23503":
      return c.json({ error: "That cannot be removed because other records still point to it." }, 409);
    case "23514": {
      // Check violations carry a sentence we wrote ourselves (batch totals, names). Show it.
      const msg = (err as { cause?: { message?: string } }).cause?.message ?? err.message;
      return c.json({ error: msg || "That does not add up." }, 400);
    }
    case "22023":
    case "22P02":
    case "P0002":
      return c.json({ error: "That request is not valid." }, 400);
  }
  // Never echo error details: they can carry row data. Sentry gets the scrubbed event.
  console.error("api error", { path: c.req.path, name: err.name });
  try {
    reporter?.(err, { path: c.req.path, method: c.req.method });
  } catch {
    // Reporting must never turn one error into two.
  }
  return c.json({ error: "Something went wrong" }, 500);
}
