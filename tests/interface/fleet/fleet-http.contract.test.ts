import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../apps/fleet/src/app.module";
import { createCorsOptions } from "@shared/http";

describe("Fleet HTTP contract", () => {
  let app: INestApplication;
  const previousBackend = process.env.PERSISTENCE_BACKEND;

  beforeAll(async () => {
    process.env.PERSISTENCE_BACKEND = "in-memory";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.enableCors(createCorsOptions());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env.PERSISTENCE_BACKEND = previousBackend;
  });

  it("GET /fleet/health returns service health", async () => {
    const response = await request(app.getHttpServer()).get("/fleet/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "fleet" });
  });

  it("POST /fleet/vehicles creates a vehicle with required headers", async () => {
    const response = await request(app.getHttpServer())
      .post("/fleet/vehicles")
      .set("x-user-role", "admin")
      .set("Idempotency-Key", randomUUID())
      .send({
        plateNumber: "TM-909",
        model: "Volvo FH",
        tenantId: "default",
      });

    expect(response.status).toBe(201);
    expect(response.body.plateNumber).toBe("TM-909");
  });

  it("POST /fleet/vehicles rejects unauthorized role", async () => {
    const response = await request(app.getHttpServer())
      .post("/fleet/vehicles")
      .set("x-user-role", "operator")
      .set("Idempotency-Key", randomUUID())
      .send({
        plateNumber: "TM-910",
        model: "Scania R450",
        tenantId: "default",
      });

    expect(response.status).toBe(403);
  });

  it("POST /fleet/events/job-status returns publish response contract", async () => {
    const response = await request(app.getHttpServer())
      .post("/fleet/events/job-status?jobId=job-1&status=assigned")
      .set("x-user-role", "admin")
      .set("Idempotency-Key", randomUUID());

    expect(response.status).toBe(201);
    expect(response.body.published).toBe(true);
    expect(response.body.subject).toContain("job.status.changed");
  });

  it("OPTIONS /fleet/vehicles exposes CORS preflight headers", async () => {
    const response = await request(app.getHttpServer())
      .options("/fleet/vehicles")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });
});
