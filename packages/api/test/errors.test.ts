import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { handleApiError, setErrorReporter } from "../src/errors";

describe("API error reporting", () => {
  afterEach(() => setErrorReporter(undefined));

  const appThrowing = (err: Error) => new Hono().get("/api/v1/orgs/:id/x", () => { throw err; }).onError(handleApiError);

  it("reports unexpected errors once, and answers with a plain message", async () => {
    const seen: { err: Error; path: string }[] = [];
    setErrorReporter((err, where) => seen.push({ err, path: where.path }));
    const res = await appThrowing(new Error("boom for dana@example.org")).request("/api/v1/orgs/6b1f0c2e-1a2b-4c3d-8e9f-001122334455/x");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Something went wrong" });
    expect(seen).toHaveLength(1);
  });

  it("does not report expected refusals like a permission check", async () => {
    const seen: Error[] = [];
    setErrorReporter((err) => seen.push(err));
    const denied = Object.assign(new Error("new row violates row-level security policy"), { code: "42501" });
    const res = await appThrowing(denied).request("/api/v1/orgs/x/x");
    expect(res.status).toBe(403);
    expect(seen).toHaveLength(0);
  });

  it("a failing reporter never breaks the response", async () => {
    setErrorReporter(() => {
      throw new Error("reporter down");
    });
    const res = await appThrowing(new Error("boom")).request("/api/v1/orgs/x/x");
    expect(res.status).toBe(500);
  });
});
