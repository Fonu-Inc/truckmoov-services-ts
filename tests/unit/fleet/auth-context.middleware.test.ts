import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AppConfigService } from "@shared/config";
import { AuthContextMiddleware } from "../../../apps/fleet/src/auth-context.middleware";

function signToken(payload: Record<string, unknown>, secret = "replace-me") {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

describe("AuthContextMiddleware", () => {
  it("extracts tenant and role from bearer tokens without trusting client tenant input", () => {
    const middleware = new AuthContextMiddleware({
      auth: { jwtSecret: "replace-me" },
    } as AppConfigService);

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

    const next = vi.fn();
    middleware.use(req, {} as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({
      userId: "user-1",
      email: "fleet@example.com",
      role: "DISPATCHER",
      tenantId: "tenant-from-token",
    });
    expect(req.headers["x-user-role"]).toBe("DISPATCHER");
    expect(req.headers["x-tenant-id"]).toBe("tenant-from-token");
    expect(req.query.tenantId).toBe("client-tenant");
    expect(req.body.tenantId).toBe("client-tenant");
  });
});
