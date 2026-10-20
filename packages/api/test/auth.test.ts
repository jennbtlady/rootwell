import { describe, expect, it } from "vitest";
import { app, setVerifier } from "../src";

describe("api auth gate", () => {
  it("health is public", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("everything else needs a bearer token", async () => {
    setVerifier(async () => {
      throw new Error("bad token");
    });
    expect((await app.request("/api/v1/me")).status).toBe(401);
    expect((await app.request("/api/v1/orgs")).status).toBe(401);
    expect((await app.request("/api/v1/me", { headers: { authorization: "Bearer nope" } })).status).toBe(401);
    setVerifier(undefined);
  });

  it("rejects an invalid org payload before touching the database", async () => {
    setVerifier(async () => ({ sub: "00000000-0000-0000-0000-000000000001", aal: "aal1" }));
    const res = await app.request("/api/v1/orgs", {
      method: "POST",
      headers: { authorization: "Bearer ok", "content-type": "application/json" },
      body: JSON.stringify({ name: "A" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: string; message: string }[] };
    expect(body.error).toBe("Invalid input");
    expect(body.issues[0]?.path).toBe("name");
    setVerifier(undefined);
  });
});
