import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

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
    case "22023":
    case "23503":
    case "22P02":
      return c.json({ error: "That request is not valid." }, 400);
  }
  // Never echo error details: they can carry row data. Sentry gets the scrubbed event.
  console.error("api error", { path: c.req.path, name: err.name });
  return c.json({ error: "Something went wrong" }, 500);
}
