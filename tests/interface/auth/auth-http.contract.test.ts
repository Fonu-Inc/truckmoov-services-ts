import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { describe, afterAll, beforeAll, expect, it } from "vitest";
import { AppModule } from "../../../apps/auth/src/app.module";
import { createCorsOptions } from "@shared/http";

describe("Auth HTTP contract", () => {
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

  it("GET /auth/health returns service health", async () => {
    const response = await request(app.getHttpServer()).get("/auth/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "auth" });
  });

  it("POST /auth/login then GET /auth/me returns authenticated principal", async () => {
    const loginResponse = await request(app.getHttpServer()).post("/auth/login").send({
      username: "dev-admin",
      password: "StrongPass123!",
    });

    expect(loginResponse.status).toBe(201);
    expect(loginResponse.body.accessToken).toBeTypeOf("string");

    const meResponse = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.username).toBe("dev-admin");
    expect(meResponse.body.roles).toContain("admin");
  });

  it("POST /auth/refresh with unknown token returns 401", async () => {
    const response = await request(app.getHttpServer()).post("/auth/refresh").send({
      refreshToken: "unknown-token-12345",
    });

    expect(response.status).toBe(401);
  });

  it("OPTIONS /auth/login exposes CORS preflight headers", async () => {
    const response = await request(app.getHttpServer())
      .options("/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });
});
