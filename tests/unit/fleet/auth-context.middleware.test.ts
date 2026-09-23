import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AppConfigService } from "@shared/config";
import { ServiceCaller } from "@shared/identity";
import { AuthContextMiddleware } from "../../../apps/fleet/src/auth-context.middleware";

function signToken(payload: Record<string, unknown>, secret = "replace-me") {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json };
}

describe("AuthContextMiddleware", () => {
  it("extracts tenant and role from bearer tokens without trusting client tenant input", async () => {
    const middleware = new AuthContextMiddleware({
      auth: { jwtSecret: "replace-me" },
      identity: { signingKey: "", publicKeys: "", legacySecret: "replace-me", serviceTokenDir: "/nonexistent", serviceAuthDevSecret: "" },
    } as unknown as AppConfigService);

    const req: any = {
      headers: {
        authorization: `Bearer ${signToken({
          sub: "user-1",
          email: "fleet@example.com",
          role: "dispatcher",
          tenantId: "tenant-from-token",
          exp: Math.floor(Date.now() / 1000) + 3600,
        })}` ,
      },
      query: { tenantId: "client-tenant" },
      body: { tenantId: "client-tenant", registrationNumber: "TM-101" },
    };

    const res = makeRes();
    const next = vi.fn();
    await middleware.use(req, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toEqual({
      userId: "user-1",
      email: "fleet@example.com",
      role: "DISPATCHER",
      tenantId: "tenant-from-token",
      portal: "tenant",
    });
    expect(req.headers["x-user-role"]).toBe("DISPATCHER");
    expect(req.headers["x-tenant-id"]).toBe("tenant-from-token");
    expect(req.query.tenantId).toBe("client-tenant");
    expect(req.body.tenantId).toBe("client-tenant");
  });

  it("rejects requests with no Authorization header", async () => {
    const middleware = new AuthContextMiddleware({
      auth: { jwtSecret: "replace-me" },
      identity: { signingKey: "", publicKeys: "", legacySecret: "replace-me", serviceTokenDir: "/nonexistent", serviceAuthDevSecret: "" },
    } as unknown as AppConfigService);

    const req: any = { headers: {} };
    const res = makeRes();
    const next = vi.fn();

    await middleware.use(req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "missing or invalid authorization" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects requests with a malformed Authorization header", async () => {
    const middleware = new AuthContextMiddleware({
      auth: { jwtSecret: "replace-me" },
      identity: { signingKey: "", publicKeys: "", legacySecret: "replace-me", serviceTokenDir: "/nonexistent", serviceAuthDevSecret: "" },
    } as unknown as AppConfigService);

    const req: any = { headers: { authorization: "Bearer not-a-valid-token" } };
    const res = makeRes();
    const next = vi.fn();

    await middleware.use(req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects requests with an invalid signature", async () => {
    const middleware = new AuthContextMiddleware({
      auth: { jwtSecret: "replace-me" },
      identity: { signingKey: "", publicKeys: "", legacySecret: "replace-me", serviceTokenDir: "/nonexistent", serviceAuthDevSecret: "" },
    } as unknown as AppConfigService);

    const token = signToken(
      {
        sub: "user-1",
        email: "fleet@example.com",
        role: "dispatcher",
        tenantId: "tenant-1",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      "wrong-secret",
    );
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    const next = vi.fn();

    await middleware.use(req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects requests with an expired token", async () => {
    const middleware = new AuthContextMiddleware({
      auth: { jwtSecret: "replace-me" },
      identity: { signingKey: "", publicKeys: "", legacySecret: "replace-me", serviceTokenDir: "/nonexistent", serviceAuthDevSecret: "" },
    } as unknown as AppConfigService);

    const token = signToken({
      sub: "user-1",
      email: "fleet@example.com",
      role: "dispatcher",
      tenantId: "tenant-1",
      exp: Math.floor(Date.now() / 1000) - 3600,
    });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    const next = vi.fn();

    await middleware.use(req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  describe("service calls", () => {
    const DEV = "dev-secret";
    const middleware = () =>
      new AuthContextMiddleware({
        identity: { signingKey: "", publicKeys: "", legacySecret: "", serviceTokenDir: "/nonexistent", serviceAuthDevSecret: DEV },
      } as unknown as AppConfigService);
    const call = (caller: string, tenantId?: string) =>
      new ServiceCaller({ self: caller, tokenDir: "/nonexistent", devSecret: DEV, legacySecret: "" }).headers("fleet", { tenantId })!;

    it("acts with the role fleet grants the caller, inside the tenant it names", async () => {
      const req: any = { headers: call("notification", "tenant-a") };
      await middleware().use(req, makeRes() as never, vi.fn());

      expect(req.user).toMatchObject({ service: "notification", role: "DISPATCHER", tenantId: "tenant-a", portal: "tenant" });
    });

    it("lets only auth act for no tenant, as platform staff", async () => {
      const auth: any = { headers: call("auth") };
      const dispatch: any = { headers: call("dispatch") };
      const refused = makeRes();

      await middleware().use(auth, makeRes() as never, vi.fn());
      await middleware().use(dispatch, refused as never, vi.fn());

      expect(auth.user).toMatchObject({ role: "PLATFORM_ADMIN", tenantId: "system", portal: "admin" });
      expect(refused.status).toHaveBeenCalledWith(401);
    });

    it("refuses a service fleet does not serve", async () => {
      const res = makeRes();
      await middleware().use({ headers: call("tracking", "tenant-a") } as any, res as never, vi.fn());

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
