import { createHmac } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const SECRET = "portal-enforcement-test-secret";

function bearer(role: string, tenantId: string, expiresIn = 3600) {
  const payload = Buffer.from(
    JSON.stringify({ sub: "u1", email: "u@co.com", role, tenantId, exp: Math.floor(Date.now() / 1000) + expiresIn }),
  ).toString("base64url");
  return `Bearer ${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
}

describe("Portal enforcement over HTTP", () => {
  let app: INestApplication;
  const previous = { ...process.env };

  beforeAll(async () => {
    Object.assign(process.env, { PERSISTENCE_BACKEND: "in-memory", JWT_SECRET: SECRET, PORTAL_ENFORCEMENT: "enforce" });
    vi.resetModules();
    const { AppModule } = await import("../../../apps/fleet/src/app.module");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("fleet");
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    process.env = previous;
  });

  it("serves the tenant portal", async () => {
    const res = await request(app.getHttpServer()).get("/fleet/vehicles").set("Authorization", bearer("FLEET_ADMIN", "tenant-a"));
    expect(res.status).toBe(200);
  });

  // The refusal and the missing route must be byte-for-byte the same, or the
  // difference itself tells a caller the route exists.
  it("answers an admin-portal token on a tenant route exactly like a route that does not exist", async () => {
    const token = bearer("PLATFORM_ADMIN", "system");
    const refused = await request(app.getHttpServer()).get("/fleet/vehicles").set("Authorization", token);
    const missing = await request(app.getHttpServer()).get("/fleet/vehicle").set("Authorization", token);

    expect(refused.status).toBe(404);
    expect(refused.body).toEqual({ ...missing.body, message: missing.body.message.replace("/fleet/vehicle", "/fleet/vehicles") });
    expect(refused.headers["content-type"]).toBe(missing.headers["content-type"]);
  });

  it("tells an expired token to refresh", async () => {
    const res = await request(app.getHttpServer()).get("/fleet/vehicles").set("Authorization", bearer("FLEET_ADMIN", "tenant-a", -60));
    expect(res.status).toBe(401);
  });

  it("keeps public routes open", async () => {
    const res = await request(app.getHttpServer()).get("/fleet/health/ready");
    expect(res.status).not.toBe(404);
  });
});
