import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";

/**
 * Wraps @hono/zod-validator so every invalid request gets the same small 400 body:
 * { error: "Invalid input", issues: [{ path, message }] }. The raw ZodError is too
 * verbose for the web client and the mobile app to show.
 */
export function validate<T extends ZodType>(target: "json" | "query" | "param", schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "Invalid input",
          issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400,
      );
    }
  });
}
