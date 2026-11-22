import { createHmac } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "fleet-bundle-catalog-test-secret";

function authToken(role = "admin") {
  const payload = Buffer.from(JSON.stringify({
    sub: "user-1",
    email: "fleet@example.com",
    role,
    tenantId: "default",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  return `Bearer ${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
}

const catalog = {
  carriers: [{ id: "car-mtn", name: "MTN Nigeria", code: "MTN", status: "active" }],
  bundles: [
    { id: "b-mtn-1gb", carrierId: "car-mtn", name: "MTN 1GB", planType: "monthly", dataAllowanceMb: 1024, priceNgn: 1000, status: "active" },
    { id: "b-glo-1gb", carrierId: "car-glo", name: "Glo 1GB", planType: "monthly", dataAllowanceMb: 1024, priceNgn: 900, status: "active" },
  ],
};

describe("Fleet carrier catalog read from auth", () => {
  let app: INestApplication;
  const reader = { read: vi.fn() };
  const previous = { ...process.env };

  beforeAll(async () => {
    Object.assign(process.env, { PERSISTENCE_BACKEND: "in-memory", JWT_SECRET: SECRET });
    vi.resetModules();
    const { AppModule } = await import("../../../apps/fleet/src/app.module");
    const { BUNDLE_CATALOG_READER } = await import("../../../apps/fleet/src/contexts/fleet/carriers");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BUNDLE_CATALOG_READER)
      .useValue(reader)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("fleet");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    process.env = previous;
    vi.resetModules();
  });

  beforeEach(() => {
    reader.read.mockReset().mockResolvedValue(catalog);
  });

  const get = (path: string) => request(app.getHttpServer()).get(path).set("Authorization", authToken());
  const createRequest = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post("/fleet/device-setup-requests")
      .set("Authorization", authToken())
      .send({ useCase: "Telematics", simRequired: true, pickupLocationId: "demo-1", ...body });

  it("GET /fleet/carriers lists auth's carriers", async () => {
    const res = await get("/fleet/carriers");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: true, message: "success", data: catalog.carriers });
  });

  it("GET /fleet/data-bundles lists auth's bundles, filtered by carrier", async () => {
    const all = await get("/fleet/data-bundles");
    expect(all.body.data).toEqual(catalog.bundles);

    const mtn = await get("/fleet/data-bundles?carrierId=car-mtn");
    expect(mtn.body.data.map((b: { id: string }) => b.id)).toEqual(["b-mtn-1gb"]);
  });

  it.each(["/fleet/carriers", "/fleet/data-bundles"])("%s answers 503 when auth cannot be reached", async (path) => {
    reader.read.mockResolvedValue(null);
    const res = await get(path);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: false,
      statusCode: 503,
      message: "Carrier catalog cannot be read right now",
      error: "Service Unavailable",
    });
  });

  it("POST /fleet/device-setup-requests checks the SIM pick against auth's catalog", async () => {
    const unknown = await createRequest({ carrierId: "carrier-mtn" });
    expect(unknown.status).toBe(400);
    expect(unknown.body).toMatchObject({ status: false, message: "carrierId is not in the carrier catalog" });

    const mismatched = await createRequest({ carrierId: "car-mtn", bundleId: "b-glo-1gb" });
    expect(mismatched.status).toBe(400);

    const valid = await createRequest({ carrierId: "car-mtn", bundleId: "b-mtn-1gb" });
    expect(valid.status).toBe(201);
    expect(valid.body).toMatchObject({ carrierId: "car-mtn", bundleId: "b-mtn-1gb" });
  });

  it("POST /fleet/device-setup-requests answers 503 when auth cannot be reached", async () => {
    reader.read.mockResolvedValue(null);
    const res = await createRequest({ carrierId: "car-mtn" });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: false, statusCode: 503 });
  });

  it("POST /fleet/device-setup-requests takes no manufacturer or tracker type and returns a DVR reference", async () => {
    const res = await createRequest({ simRequired: false, quantity: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "under_review", manufacturer: null, trackerType: null, quantity: 2 });
    expect(res.body.referenceNumber).toMatch(/^DVR-\d{6}$/);

    const found = await get(`/fleet/device-setup-requests?query=${res.body.referenceNumber}`);
    expect(found.status).toBe(200);
    expect(JSON.stringify(found.body)).toContain(res.body.id);
  });

  it("PATCH /fleet/device-setup-requests/:id/status refuses the platform's steps", async () => {
    const created = await createRequest({ simRequired: false });
    const patch = (status: string) =>
      request(app.getHttpServer())
        .patch(`/fleet/device-setup-requests/${created.body.id}/status`)
        .set("Authorization", authToken())
        .send({ status });

    const approve = await patch("awaiting_payment");
    expect(approve.status).toBe(400);
    expect(approve.body).toMatchObject({ status: false, message: "awaiting_payment is set by the platform, not by the tenant" });

    const legacy = await patch("approved");
    expect(legacy.status).toBe(400);

    const cancel = await patch("cancelled");
    expect(cancel.status).toBe(200);
  });
});
