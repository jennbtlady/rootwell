import { handle } from "hono/vercel";
import { app } from "@maple/api";

// All API traffic for web and mobile goes through the Hono app in packages/api.
// This file only adapts it to Next's route handler signature.

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
