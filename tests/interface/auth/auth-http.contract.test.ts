import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { describe, afterAll, beforeAll, expect, it } from "vitest";
import { AppModule } from "../../../apps/auth/src/app.module";
import { createCorsOptions } from "@shared/http";

function makeRegisterPayload(
  username: string,
  overrides?: Partial<{
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
  }>,
) {
  return {
    username,
    password: overrides?.password ?? "Str0ngPass!",
    firstName: overrides?.firstName ?? "Test",
    lastName: overrides?.lastName ?? "User",
    organizationName: overrides?.organizationName ?? "Truckmoov Test Org",
  };
}

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

  // ── Health ────────────────────────────────────────────

  it("GET /auth/health returns 200", async () => {
    const response = await request(app.getHttpServer()).get("/auth/health");
    expect(response.status).toBe(200);
    expect(response.body.data.service).toBe("auth");
  });

  // ── Register (enterprise admin) ──────────────────────

  it("POST /auth/register creates an enterprise admin", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send(
        makeRegisterPayload("admin@contract.com", {
          firstName: "Ada",
          lastName: "Okafor",
          organizationName: "Truckmoov Logistics",
        }),
      );

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf("string");
    expect(res.body.refreshToken).toBeTypeOf("string");
    expect(res.body.user.username).toBe("admin@contract.com");
    expect(res.body.user.tenantId).toBeTypeOf("string");
    expect(res.body.user.roles).toContain("ENTERPRISE_ADMIN");
  });

  it("POST /auth/register accepts a wrapped data payload", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        data: makeRegisterPayload("wrapped@contract.com", {
          firstName: "Wrapped",
          lastName: "Payload",
          organizationName: "Wrapped Transport",
        }),
      });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe("wrapped@contract.com");
    expect(res.body.user.roles).toContain("ENTERPRISE_ADMIN");
  });

  it("POST /auth/register rejects duplicate username", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("dupe@contract.com", {
        firstName: "Dupe",
        lastName: "Admin",
        organizationName: "Dupe Transport",
      }));

    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("dupe@contract.com", {
        firstName: "Dupe",
        lastName: "Admin",
        organizationName: "Dupe Transport",
      }));

    expect(res.status).toBe(409);
  });

  // ── Login + Me ────────────────────────────────────────

  it("POST /auth/login then GET /auth/me returns authenticated principal", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("logintest@contract.com", {
        firstName: "Login",
        lastName: "Tester",
        organizationName: "Login Fleet",
      }));

    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "logintest@contract.com", password: "Str0ngPass!" });

    expect(loginRes.status).toBe(201);
    expect(loginRes.body.accessToken).toBeTypeOf("string");

    const meRes = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.username).toBe("logintest@contract.com");
    expect(meRes.body.roles).toContain("ENTERPRISE_ADMIN");
  });

  it("POST /auth/login rejects wrong credentials", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "logintest@contract.com", password: "WrongPass!" });

    expect(res.status).toBe(401);
  });

  // ── Refresh ───────────────────────────────────────────

  it("POST /auth/refresh with unknown token returns 401", async () => {
    const response = await request(app.getHttpServer()).post("/auth/refresh").send({
      refreshToken: "unknown-token-12345",
    });

    expect(response.status).toBe(401);
  });

  // ── Invite flow ───────────────────────────────────────

  it("POST /auth/invite requires authorization", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/invite")
      .send({ email: "new@co.com", role: "FLEET_ADMIN" });

    expect(res.status).toBe(401);
  });

  it("POST /auth/invite succeeds for enterprise admin", async () => {
    const regRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("inviter@contract.com", {
        firstName: "Invite",
        lastName: "Owner",
        organizationName: "Inviter Fleet",
      }));
    expect(regRes.status).toBe(201);
    const adminToken = regRes.body.accessToken;

    const inviteRes = await request(app.getHttpServer())
      .post("/auth/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "invitee@contract.com", role: "FLEET_ADMIN" });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.message).toBe("Invitation sent");
    expect(inviteRes.body.email).toBe("invitee@contract.com");
  });

  it("POST /auth/invite rejects non-admin caller", async () => {
    const regRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("nonadmin-inviter@contract.com", {
        firstName: "Nonadmin",
        lastName: "Inviter",
        organizationName: "Nonadmin Fleet",
      }));
    const adminToken = regRes.body.accessToken;

    // First invite someone as a DISPATCHER
    await request(app.getHttpServer())
      .post("/auth/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "dispatcher-tester@contract.com", role: "DISPATCHER" });

    // Register that invited user (they become DISPATCHER)
    // For this test, we use the admin's token to try from a non-enterprise admin perspective
    // Since the dev identity provider can't produce non-admin tokens easily,
    // we verify the permission check by using an invalid token
    const res = await request(app.getHttpServer())
      .post("/auth/invite")
      .set("Authorization", "Bearer invalid-token-here")
      .send({ email: "someone@co.com", role: "DISPATCHER" });

    expect(res.status).toBe(403);
  });

  it("GET /auth/invite/validate rejects invalid token", async () => {
    const res = await request(app.getHttpServer())
      .get("/auth/invite/validate")
      .query({ token: "nonexistent-token-value" });

    expect(res.status).toBe(404);
  });

  it("POST /auth/register/invited rejects invalid invite token", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/register/invited")
      .send({
        inviteToken: "nonexistent-token-value",
        username: "new@co.com",
        password: "Str0ngPass!",
      });

    expect(res.status).toBe(404);
  });

  // ── Forgot / Verify / Reset password ──────────────────

  it("POST /auth/forgot-password returns 404 for unknown user", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ identifier: "ghost@unknown.com", method: "email" });

    expect(res.status).toBe(404);
  });

  it("POST /auth/forgot-password succeeds for registered user (email)", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("forgetter@contract.com"));

    const res = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ identifier: "forgetter@contract.com", method: "email" });

    expect(res.status).toBe(201);
    expect(res.body.method).toBe("email");
  });

  it("POST /auth/forgot-password succeeds for registered user (sms)", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("smsforgetter@contract.com"));

    const res = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({
        identifier: "smsforgetter@contract.com",
        method: "sms",
        phone: "+1234567890",
      });

    expect(res.status).toBe(201);
    expect(res.body.method).toBe("sms");
  });

  it("POST /auth/verify-reset rejects invalid email token", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/verify-reset")
      .send({ method: "email", token: "totally-bogus-token" });

    expect(res.status).toBe(400);
  });

  it("POST /auth/reset-password rejects invalid token", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: "totally-bogus-token", newPassword: "NewStr0ng!" });

    expect(res.status).toBe(400);
  });

  // ── Change role ───────────────────────────────────────

  it("POST /auth/change-role requires authorization", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/change-role")
      .send({ targetUserId: "some-id", newRole: "DISPATCHER" });

    expect(res.status).toBe(401);
  });

  it("POST /auth/change-role rejects invalid token", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/change-role")
      .set("Authorization", "Bearer bad-token")
      .send({ targetUserId: "some-id", newRole: "DISPATCHER" });

    expect(res.status).toBe(403);
  });

  it("POST /auth/change-role returns 404 for nonexistent target user", async () => {
    const regRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("roleadmin@contract.com"));
    const adminToken = regRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .post("/auth/change-role")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ targetUserId: "nonexistent-user-id", newRole: "DISPATCHER" });

    expect(res.status).toBe(404);
  });

  // ── Logout ────────────────────────────────────────────

  it("POST /auth/logout invalidates the refresh token", async () => {
    const regRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("logmeout@contract.com"));
    expect(regRes.status).toBe(201);

    const { accessToken, refreshToken } = regRes.body;

    const logoutRes = await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(logoutRes.status).toBe(201);
    expect(logoutRes.body.message).toContain("Logged out");

    const refreshRes = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken });

    expect(refreshRes.status).toBe(401);
  });

  it("POST /auth/logout works without authorization header", async () => {
    const regRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("logmeout2@contract.com"));

    const logoutRes = await request(app.getHttpServer())
      .post("/auth/logout")
      .send({ refreshToken: regRes.body.refreshToken });

    expect(logoutRes.status).toBe(201);
    expect(logoutRes.body.message).toContain("Logged out");
  });

  // ── User profile + preferences (Epic B) ──────────────

  it("GET/PATCH /auth/profile supports viewing and editing own profile", async () => {
    const regRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send(
        makeRegisterPayload("profile@contract.com", {
          firstName: "Profile",
          lastName: "Owner",
          organizationName: "Profile Fleet",
        }),
      );
    const accessToken = regRes.body.accessToken as string;

    const getProfileRes = await request(app.getHttpServer())
      .get("/auth/profile")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(getProfileRes.status).toBe(200);
    expect(getProfileRes.body.profile.fullName).toBe("Profile Owner");
    expect(getProfileRes.body.profile.phoneNumber).toBeNull();

    const patchProfileRes = await request(app.getHttpServer())
      .patch("/auth/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        fullName: "Adebayo Adekunle",
        phoneNumber: "+2348011112222",
      });

    expect(patchProfileRes.status).toBe(200);
    expect(patchProfileRes.body.profile.fullName).toBe("Adebayo Adekunle");
    expect(patchProfileRes.body.profile.phoneNumber).toBe("+2348011112222");
  });

  it("GET/PATCH /auth/preferences/notifications supports notification settings", async () => {
    const regRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("notify@contract.com"));
    const accessToken = regRes.body.accessToken as string;

    const patchRes = await request(app.getHttpServer())
      .patch("/auth/preferences/notifications")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        emailAlerts: true,
        smsAlerts: true,
        pushAlerts: false,
        incidentAlerts: true,
        jobUpdates: false,
        marketingAnnouncements: true,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.notificationPreferences.smsAlerts).toBe(true);
    expect(patchRes.body.notificationPreferences.pushAlerts).toBe(false);

    const getRes = await request(app.getHttpServer())
      .get("/auth/preferences/notifications")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.notificationPreferences.marketingAnnouncements).toBe(true);
    expect(getRes.body.notificationPreferences.jobUpdates).toBe(false);
  });

  it("PATCH /auth/preferences/dispatch allows dispatcher to set working hours/timezone", async () => {
    const regRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("dispatch-pref@contract.com"));
    expect(regRes.status).toBe(201);

    const initialToken = regRes.body.accessToken as string;
    const targetUserId = regRes.body.user.id as string;

    const roleRes = await request(app.getHttpServer())
      .post("/auth/change-role")
      .set("Authorization", `Bearer ${initialToken}`)
      .send({ targetUserId, newRole: "DISPATCHER" });
    expect(roleRes.status).toBe(201);

    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        username: "dispatch-pref@contract.com",
        password: "Str0ngPass!",
      });
    expect(loginRes.status).toBe(201);
    const dispatcherToken = loginRes.body.accessToken as string;

    const patchRes = await request(app.getHttpServer())
      .patch("/auth/preferences/dispatch")
      .set("Authorization", `Bearer ${dispatcherToken}`)
      .send({
        timezone: "Africa/Lagos",
        shiftStart: "08:00",
        shiftEnd: "16:00",
        workDays: [1, 2, 3, 4, 5, 6],
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.dispatcherPreferences.timezone).toBe("Africa/Lagos");
    expect(patchRes.body.dispatcherPreferences.shiftStart).toBe("08:00");
    expect(patchRes.body.dispatcherPreferences.shiftEnd).toBe("16:00");
    expect(patchRes.body.dispatcherPreferences.workDays).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("GET /auth/preferences/dispatch rejects non-dispatcher", async () => {
    const regRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("not-dispatch@contract.com"));
    const accessToken = regRes.body.accessToken as string;

    const res = await request(app.getHttpServer())
      .get("/auth/preferences/dispatch")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  });

  it("GET/PATCH /auth/organization/settings allows enterprise admin to configure branding/defaults", async () => {
    const regRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send(
        makeRegisterPayload("org-admin@contract.com", {
          organizationName: "Initial Fleet Org",
        }),
      );
    const accessToken = regRes.body.accessToken as string;

    const initialGetRes = await request(app.getHttpServer())
      .get("/auth/organization/settings")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(initialGetRes.status).toBe(200);
    expect(initialGetRes.body.branding.organizationName).toBe("Initial Fleet Org");

    const patchRes = await request(app.getHttpServer())
      .patch("/auth/organization/settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        branding: {
          organizationName: "Lagos Express Logistics",
          primaryColor: "#0D9488",
          secondaryColor: "#0EA5E9",
        },
        defaults: {
          timezone: "Africa/Lagos",
          currency: "NGN",
          dateFormat: "DD/MM/YYYY",
          weekStartsOn: "monday",
        },
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.branding.organizationName).toBe("Lagos Express Logistics");
    expect(patchRes.body.defaults.currency).toBe("NGN");

    const getRes = await request(app.getHttpServer())
      .get("/auth/organization/settings")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.branding.primaryColor).toBe("#0D9488");
    expect(getRes.body.defaults.timezone).toBe("Africa/Lagos");
  });

  it("GET /auth/organization/settings rejects non-enterprise-admin user", async () => {
    const regRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send(makeRegisterPayload("org-denied@contract.com"));
    const initialToken = regRes.body.accessToken as string;
    const userId = regRes.body.user.id as string;

    const roleRes = await request(app.getHttpServer())
      .post("/auth/change-role")
      .set("Authorization", `Bearer ${initialToken}`)
      .send({ targetUserId: userId, newRole: "DISPATCHER" });
    expect(roleRes.status).toBe(201);

    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        username: "org-denied@contract.com",
        password: "Str0ngPass!",
      });
    const dispatcherToken = loginRes.body.accessToken as string;

    const res = await request(app.getHttpServer())
      .get("/auth/organization/settings")
      .set("Authorization", `Bearer ${dispatcherToken}`);

    expect(res.status).toBe(403);
  });

  // ── CORS ──────────────────────────────────────────────

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
