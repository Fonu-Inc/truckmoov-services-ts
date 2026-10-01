import { createHmac, randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCorsOptions } from "@shared/http";

process.env.PERSISTENCE_BACKEND = "in-memory";
const TEST_JWT_SECRET = "fleet-contract-test-secret";

function signFleetToken(
  payload: Record<string, unknown>,
  secret = TEST_JWT_SECRET,
) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function authToken(role: string, tenantId = "default") {
  return `Bearer ${signFleetToken({
    sub: "user-1",
    email: "fleet@example.com",
    role,
    tenantId,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}`;
}

describe("Fleet HTTP contract", () => {
  let app: INestApplication;
  const previousBackend = process.env.PERSISTENCE_BACKEND;
  const previousJwtSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.PERSISTENCE_BACKEND = "in-memory";
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    vi.resetModules();
    const { AppModule } = await import("../../../apps/fleet/src/app.module");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // mirrors main.ts: this service owns the /fleet namespace
    app.setGlobalPrefix("fleet");
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
    process.env.JWT_SECRET = previousJwtSecret;
    vi.resetModules();
  });

  it("GET /fleet/health returns service health", async () => {
    const response = await request(app.getHttpServer()).get("/fleet/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: true,
      message: "success",
      data: { service: "fleet" },
    });
  });

  it("GET /fleet/test-sentry returns 500", async () => {
    const response = await request(app.getHttpServer())
      .get("/fleet/test-sentry")
      .set("Authorization", authToken("admin"));
    expect(response.status).toBe(500);
  });

  it("supports assignment, activation, contact channels, and GPS mapping", async () => {
    // 8 sequential real HTTP round-trips through a full Nest bootstrap —
    // comfortably under 5s in isolation, but the default timeout has been
    // observed to flake under full-suite CPU contention.
    const createVehicle = await request(app.getHttpServer())
      .post("/fleet/vehicles")
      .set("Authorization", authToken("admin"))
      .send({
        registrationNumber: "TM-909",
        vin: "1HGCM82633A123456",
        make: "Volvo",
        model: "FH",
        year: 2025,
        type: "truck",
        capacity: 18,
      });
    expect(createVehicle.status).toBe(201);
    expect(createVehicle.body.registrationNumber).toBe("TM-909");
    expect(createVehicle.body.plateNumber).toBe("TM-909");
    expect(createVehicle.body.vin).toBe("1HGCM82633A123456");
    expect(createVehicle.body.make).toBe("Volvo");
    expect(createVehicle.body.model).toBe("FH");
    expect(createVehicle.body.year).toBe(2025);
    expect(createVehicle.body.type).toBe("truck");
    expect(createVehicle.body.capacity).toBe(18);

    const fetchedVehicle = await request(app.getHttpServer())
      .get(`/fleet/vehicles/${createVehicle.body.id}`)
      .set("Authorization", authToken("dispatcher"));
    expect(fetchedVehicle.status).toBe(200);
    expect(fetchedVehicle.body.registrationNumber).toBe("TM-909");
    expect(fetchedVehicle.body.vin).toBe("1HGCM82633A123456");
    expect(fetchedVehicle.body.make).toBe("Volvo");

    const createDriver = await request(app.getHttpServer())
      .post("/fleet/drivers")
      .set("Authorization", authToken("admin"))
      .set("Idempotency-Key", randomUUID())
      .send({
        firstName: "Ayo",
        lastName: "Dispatcher",
        phone: "+2348000000101",
        email: "ayo.dispatcher@example.com",
        licenseNumber: "LIC-909",
        licenseExpiryDate: "2026-10-01",
        communicationPreference: "whatsapp",
        status: "available",
      });
    expect(createDriver.status).toBe(201);
    expect(createDriver.body.firstName).toBe("Ayo");
    expect(createDriver.body.lastName).toBe("Dispatcher");
    expect(createDriver.body.name).toBe("Ayo Dispatcher");
    expect(createDriver.body.phone).toBe("+2348000000101");
    expect(createDriver.body.email).toBe("ayo.dispatcher@example.com");
    expect(createDriver.body.licenseExpiryDate).toBe("2026-10-01");
    expect(createDriver.body.communicationPreference).toBe("whatsapp");
    expect(createDriver.body.status).toBe("available");

    const assignment = await request(app.getHttpServer())
      .patch(`/fleet/vehicles/${createVehicle.body.id}/assignment`)
      .set("Authorization", authToken("dispatcher"))
      .set("Idempotency-Key", randomUUID())
      .send({
        driverId: createDriver.body.id,
      });
    expect(assignment.status).toBe(200);
    expect(assignment.body.vehicle.assignedDriverId).toBe(createDriver.body.id);
    expect(assignment.body.driver.assignedVehicleId).toBe(createVehicle.body.id);

    const gpsUpdate = await request(app.getHttpServer())
      .patch(`/fleet/vehicles/${createVehicle.body.id}/gps-device`)
      .set("Authorization", authToken("fleet_manager"))
      .set("Idempotency-Key", randomUUID())
      .send({
        imei: "359779090012345",
        manufacturer: "Teltonika",
        model: "FMC130",
        firmwareVersion: "3.28.07",
      });
    expect(gpsUpdate.status).toBe(200);
    expect(gpsUpdate.body.gpsDevice.imei).toBe("359779090012345");
    expect(gpsUpdate.body.gpsDevice.manufacturer).toBe("Teltonika");
    expect(gpsUpdate.body.gpsDevice.model).toBe("FMC130");
    expect(gpsUpdate.body.gpsDevice.firmwareVersion).toBe("3.28.07");

    const listGpsDevices = await request(app.getHttpServer())
      .get("/fleet/gps-devices?query=359779090012345")
      .set("Authorization", authToken("dispatcher"));
    expect(listGpsDevices.status).toBe(200);
    expect(listGpsDevices.body.data).toHaveLength(1);
    expect(listGpsDevices.body.data[0]).toMatchObject({
      id: "359779090012345",
      imei: "359779090012345",
      manufacturer: "Teltonika",
      model: "FMC130",
      firmwareVersion: "3.28.07",
      vehicleId: createVehicle.body.id,
      vehicleRegistrationNumber: "TM-909",
      vehicleStatus: "active",
    });

    const contactUpdate = await request(app.getHttpServer())
      .patch(`/fleet/drivers/${createDriver.body.id}/contact-channels`)
      .set("Authorization", authToken("dispatcher"))
      .set("Idempotency-Key", randomUUID())
      .send({
        whatsappNumber: "+2348000000001",
        smsNumber: "+2348000000002",
      });
    expect(contactUpdate.status).toBe(200);
    expect(contactUpdate.body.contactChannels.whatsappNumber).toBe(
      "+2348000000001",
    );

    const deactivateVehicle = await request(app.getHttpServer())
      .patch(`/fleet/vehicles/${createVehicle.body.id}/status`)
      .set("Authorization", authToken("fleet_manager"))
      .set("Idempotency-Key", randomUUID())
      .send({ status: "inactive" });
    expect(deactivateVehicle.status).toBe(200);
    expect(deactivateVehicle.body.status).toBe("inactive");

    const driverAfterDeactivate = await request(app.getHttpServer())
      .get(`/fleet/drivers/${createDriver.body.id}`)
      .set("Authorization", authToken("dispatcher"));
    expect(driverAfterDeactivate.status).toBe(200);
    expect(driverAfterDeactivate.body.assignedVehicleId).toBeNull();
  }, 120_000);

  it("GET /alerts includes createdAt in alert responses", async () => {
    const { ALERT_REPOSITORY, Alert } = await import("../../../apps/fleet/src/contexts/fleet/alerts");
    const alertRepo = app.get<any>(ALERT_REPOSITORY);
    const triggeredAt = new Date("2026-03-30T10:00:00.000Z");

    await alertRepo.save(Alert.create({
      id: "alert-1",
      tenantId: "default",
      type: "route_deviation",
      severity: "high",
      status: "open",
      vehicleId: "vehicle-1",
      jobId: "job-1",
      details: { deltaKm: 12.4 },
      triggeredAt,
      acknowledgedAt: null,
      resolvedAt: null,
      escalatedAt: null,
      acknowledgedBy: null,
      resolvedBy: null,
    }));

    const response = await request(app.getHttpServer())
      .get("/fleet/alerts")
      .set("Authorization", authToken("dispatcher"));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].createdAt).toBe("2026-03-30T10:00:00.000Z");
    expect(response.body.data[0].triggeredAt).toBe("2026-03-30T10:00:00.000Z");
  });

  it("treats idempotency headers as optional but still rejects duplicate keys when provided", async () => {
    const duplicateKey = randomUUID();

    const first = await request(app.getHttpServer())
      .post("/fleet/vehicles")
      .set("Authorization", authToken("admin"))
      .set("Idempotency-Key", duplicateKey)
      .send({
        registrationNumber: "TM-919",
        vin: "1HGCM82633A654321",
        make: "Mercedes-Benz",
        model: "Actros",
        year: 2026,
        type: "truck",
        capacity: 15,
      });

    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post("/fleet/vehicles")
      .set("Authorization", authToken("admin"))
      .set("Idempotency-Key", duplicateKey)
      .send({
        registrationNumber: "TM-920",
        vin: "1HGCM82633A654322",
        make: "Mercedes-Benz",
        model: "Actros",
        year: 2026,
        type: "truck",
        capacity: 15,
      });

    expect(second.status).toBe(409);
    expect(second.body.message).toBe("Duplicate idempotent request");
  });

  it("supports standalone device inventory, lifecycle transitions, and assignment validation", async () => {
    // Many sequential real HTTP round-trips through a full Nest bootstrap —
    // comfortably under 5s in isolation, but the default timeout has been
    // observed to flake under full-suite CPU contention.
    const createVehicle = await request(app.getHttpServer())
      .post("/fleet/vehicles")
      .set("Authorization", authToken("fleet_manager"))
      .send({
        registrationNumber: "TM-930",
        vin: "1HGCM82633A777777",
        make: "DAF",
        model: "XF",
        year: 2026,
        type: "truck",
        capacity: 22,
      });
    expect(createVehicle.status).toBe(201);

    const createDevice = await request(app.getHttpServer())
      .post("/fleet/devices")
      .set("Authorization", authToken("fleet_manager"))
      .send({
        imei: "359779090012399",
        manufacturer: "Teltonika",
        model: "FMC130",
        firmwareVersion: "3.28.07",
      });
    expect(createDevice.status).toBe(201);
    expect(createDevice.body.lifecycleStatus).toBe("registered");
    expect(createDevice.body.status).toBe("registered");

    const listDevices = await request(app.getHttpServer())
      .get("/fleet/devices?query=359779090012399")
      .set("Authorization", authToken("dispatcher"));
    expect(listDevices.status).toBe(200);
    expect(listDevices.body).toHaveLength(1);
    expect(listDevices.body[0]).toMatchObject({
      imei: "359779090012399",
      manufacturer: "Teltonika",
      model: "FMC130",
      status: "registered",
      lifecycleStatus: "registered",
    });

    for (const lifecycleStatus of ["config_pending", "configured", "verified_online", "assignable"] as const) {
      const transition = await request(app.getHttpServer())
        .patch(`/fleet/devices/${createDevice.body.id}/lifecycle`)
        .set("Authorization", authToken("fleet_manager"))
        .send({ lifecycleStatus });
      expect(transition.status).toBe(200);
      expect(transition.body.lifecycleStatus).toBe(lifecycleStatus);
    }

    const validation = await request(app.getHttpServer())
      .get(`/fleet/devices/${createDevice.body.id}/assignment/validate`)
      .set("Authorization", authToken("dispatcher"))
      .query({ vehicleId: createVehicle.body.id });
    expect(validation.status).toBe(200);
    expect(validation.body).toEqual({ canAssign: true });

    const assign = await request(app.getHttpServer())
      .patch(`/fleet/devices/${createDevice.body.id}/assignment`)
      .set("Authorization", authToken("fleet_manager"))
      .send({ vehicleId: createVehicle.body.id });
    expect(assign.status).toBe(200);
    expect(assign.body.lifecycleStatus).toBe("assigned");
    expect(assign.body.vehicleId).toBe(createVehicle.body.id);

    const legacyGpsList = await request(app.getHttpServer())
      .get("/fleet/gps-devices?query=359779090012399")
      .set("Authorization", authToken("dispatcher"));
    expect(legacyGpsList.status).toBe(200);
    expect(legacyGpsList.body.data[0]).toMatchObject({
      imei: "359779090012399",
      vehicleId: createVehicle.body.id,
      vehicleRegistrationNumber: "TM-930",
      lifecycleStatus: "assigned",
      status: "assigned",
    });

    const unassign = await request(app.getHttpServer())
      .delete(`/fleet/devices/${createDevice.body.id}/assignment`)
      .set("Authorization", authToken("fleet_manager"));
    expect(unassign.status).toBe(200);
    expect(unassign.body.vehicleId).toBeNull();
    expect(unassign.body.lifecycleStatus).toBe("assignable");

    const vehicleAfterUnassign = await request(app.getHttpServer())
      .get(`/fleet/vehicles/${createVehicle.body.id}`)
      .set("Authorization", authToken("dispatcher"));
    expect(vehicleAfterUnassign.status).toBe(200);
    expect(vehicleAfterUnassign.body.gpsDevice).toBeNull();

    const importCsv = [
      "imei,device_name,manufacturer,model,firmware_version,lifecycle_status",
      "359779090012400,Depot spare,Queclink,GV300,1.0.0,registered",
      "not-an-imei,Broken row,Queclink,GV300,1.0.0,registered",
    ].join("\n");
    const bulkImport = await request(app.getHttpServer())
      .post("/fleet/devices/import")
      .set("Authorization", authToken("fleet_manager"))
      .attach("file", Buffer.from(importCsv, "utf8"), "devices.csv");
    expect(bulkImport.status).toBe(201);
    expect(bulkImport.body.created).toBe(1);
    // The unreadable row is reported, not fatal: the good row still imports.
    expect(bulkImport.body.skipped).toHaveLength(1);
    expect(bulkImport.body.skipped[0].line).toBe(3);

    const summary = await request(app.getHttpServer())
      .get("/fleet/devices/summary")
      .set("Authorization", authToken("fleet_manager"));
    expect(summary.status).toBe(200);
    expect(summary.body.data.total).toBeGreaterThan(0);
    expect(summary.body.data.allowance).toMatchObject({ unlimited: expect.any(Boolean) });
    expect(summary.body.data).toMatchObject({ online: expect.any(Number), offline: expect.any(Number), suspended: expect.any(Number) });
    expect(summary.body.data.online + summary.body.data.offline).toBeLessThanOrEqual(summary.body.data.total);

    const filters = await request(app.getHttpServer())
      .get("/fleet/devices/filters")
      .set("Authorization", authToken("fleet_manager"));
    expect(filters.status).toBe(200);
    expect(filters.body.data.statuses.map((s: { value: string }) => s.value)).toContain("unregistered");
    expect(filters.body.data.lastSeen).toHaveLength(5);
    expect(filters.body.data.statuses.map((s: { value: string }) => s.value)).toEqual(
      expect.arrayContaining(["online", "offline", "suspended"]),
    );

    // None of these devices has reported, so every in-service one is offline.
    const offline = await request(app.getHttpServer())
      .get("/fleet/devices?status=offline")
      .set("Authorization", authToken("fleet_manager"));
    expect(offline.status).toBe(200);
    expect(offline.body).toHaveLength(summary.body.data.offline);
    expect(offline.body.every((device: { lastSeen: string | null }) => device.lastSeen === null)).toBe(true);

    const online = await request(app.getHttpServer())
      .get("/fleet/devices?status=online")
      .set("Authorization", authToken("fleet_manager"));
    expect(online.status).toBe(200);
    expect(online.body).toHaveLength(summary.body.data.online);

    // The dropdown offers buckets that are not lifecycle states, so they have
    // to survive the round trip through the query string.
    const unassigned = await request(app.getHttpServer())
      .get("/fleet/devices?status=unassigned")
      .set("Authorization", authToken("fleet_manager"));
    expect(unassigned.status).toBe(200);
    expect(unassigned.body.every((device: { vehicleId: string | null }) => device.vehicleId === null)).toBe(true);

    const template = await request(app.getHttpServer())
      .get("/fleet/devices/import/template")
      .set("Authorization", authToken("fleet_manager"));
    expect(template.status).toBe(200);
    expect(template.text.split("\n")[0]).toContain("imei");

    // Suspension is a platform action and crosses tenants, so it is reached
    // with an internal role rather than the tenant's own.
    const misplaced = await request(app.getHttpServer())
      .post(`/fleet/internal/devices/${createDevice.body.id}/suspend`)
      .set("Authorization", authToken("PLATFORM_ADMIN", "default"))
      .send({ reason: "Unpaid invoice" });
    expect(misplaced.status).toBe(404);

    const suspend = await request(app.getHttpServer())
      .post(`/fleet/internal/devices/${createDevice.body.id}/suspend`)
      .set("Authorization", authToken("PLATFORM_ADMIN", "system"))
      .send({ reason: "Unpaid invoice" });
    expect(suspend.status).toBe(201);
    expect(suspend.body.data.lifecycleStatus).toBe("suspended");

    const suspendAgain = await request(app.getHttpServer())
      .post(`/fleet/internal/devices/${createDevice.body.id}/suspend`)
      .set("Authorization", authToken("PLATFORM_ADMIN", "system"))
      .send({});
    expect(suspendAgain.status).toBe(400);

    const reinstate = await request(app.getHttpServer())
      .post(`/fleet/internal/devices/${createDevice.body.id}/reinstate`)
      .set("Authorization", authToken("PLATFORM_ADMIN", "system"));
    expect(reinstate.status).toBe(201);
    expect(reinstate.body.data.lifecycleStatus).toBe("assignable");

    const deleteDevice = await request(app.getHttpServer())
      .delete(`/fleet/devices/${createDevice.body.id}`)
      .set("Authorization", authToken("fleet_manager"));
    expect(deleteDevice.status).toBe(200);
    expect(deleteDevice.body.id).toBe(createDevice.body.id);
  }, 120_000);

  it("supports bulk import and dispatcher search over vehicles and drivers", async () => {
    // Vehicle import takes a CSV upload, not a JSON body.
    const vehiclesCsv = [
      "registration_number,vin,make,model,year,type,fuel_type,capacity,capacity_unit,status",
      "TM-111,,Scania,Scania R450,,,,,,",
      "TM-112,,MAN,MAN TGX,,,,,,inactive",
    ].join("\n");
    const importVehicles = await request(app.getHttpServer())
      .post("/fleet/vehicles/import")
      .set("Authorization", authToken("fleet_manager"))
      .set("Idempotency-Key", randomUUID())
      .attach("file", Buffer.from(vehiclesCsv), "vehicles.csv");
    expect(importVehicles.status).toBe(201);
    expect(importVehicles.body.created).toBe(2);
    expect(importVehicles.body.skipped).toEqual([]);

    // Driver import takes a CSV upload, not a JSON body.
    const driversCsv = [
      "first_name,last_name,phone,email,license_number,license_expiry,preferred_channel,status",
      "Driver,One,+2348000000003,,DRV-111,2026-12-01,,available",
      "Driver,Two,+2348000000004,,DRV-112,2026-12-02,,offline",
    ].join("\n");
    const importDrivers = await request(app.getHttpServer())
      .post("/fleet/drivers/import")
      .set("Authorization", authToken("fleet_manager"))
      .set("Idempotency-Key", randomUUID())
      .attach("file", Buffer.from(driversCsv), "drivers.csv");
    expect(importDrivers.status).toBe(201);
    expect(importDrivers.body.created).toBe(2);
    expect(importDrivers.body.skipped).toEqual([]);

    const search = await request(app.getHttpServer())
      .get("/fleet/dispatch/search?query=TM-11&driverStatus=active")
      .set("Authorization", authToken("dispatcher"));
    expect(search.status).toBe(200);
    expect(Array.isArray(search.body.vehicles)).toBe(true);
    expect(Array.isArray(search.body.drivers)).toBe(true);
  });

  it("serves one behaviour score across roster, driver, detail, behaviour, ranking and summary", async () => {
    const tenant = "tenant-driver-scores";
    const http = () => request(app.getHttpServer());
    const createDriver = (firstName: string, licenseNumber: string, phone: string) =>
      http()
        .post("/fleet/drivers")
        .set("Authorization", authToken("admin", tenant))
        .set("Idempotency-Key", randomUUID())
        .send({ firstName, lastName: "Doe", phone, licenseNumber, status: "available" });

    const john = await createDriver("John", "LIC-SCORE-1", "+2348000000201");
    const jane = await createDriver("Jane", "LIC-SCORE-2", "+2348000000202");
    expect(john.status).toBe(201);
    expect(jane.status).toBe(201);

    const recorded = await http()
      .post("/fleet/drivers/behavior/events")
      .set("Authorization", authToken("admin", tenant))
      .send({ driverId: john.body.id, type: "harsh_cornering", severity: "critical" });
    expect(recorded.status).toBe(201);

    const get = (path: string) => http().get(path).set("Authorization", authToken("admin", tenant));
    const roster = await get("/fleet/drivers");
    const single = await get(`/fleet/drivers/${john.body.id}`);
    const detail = await get(`/fleet/drivers/${john.body.id}/detail`);
    const behavior = await get(`/fleet/drivers/${john.body.id}/behavior`);
    const unscoredBehavior = await get(`/fleet/drivers/${jane.body.id}/behavior`);
    const ranking = await get("/fleet/drivers/behavior/ranking");
    const summary = await get("/fleet/drivers/behavior/summary");
    const unscoredFilter = await get("/fleet/drivers?scoreBand=unscored");

    const detailScore = detail.body.data.header.behaviorScore;
    expect(detailScore).toBe(97);
    expect(detail.body.data.scoreBreakdown.overall).toBe(97);
    expect(behavior.body.data.scores.overall).toBe(detailScore);

    const rosterJohn = roster.body.data.find((row: { id: string }) => row.id === john.body.id);
    const rosterJane = roster.body.data.find((row: { id: string }) => row.id === jane.body.id);
    expect(rosterJohn).toMatchObject({ behaviorScore: detailScore, scoreBand: "excellent", performanceScore: null });
    expect(rosterJane).toMatchObject({ behaviorScore: null, scoreBand: "unscored" });
    expect(single.body).toMatchObject({ behaviorScore: detailScore, scoreBand: "excellent", performanceScore: null });
    expect(unscoredFilter.body.data.map((row: { id: string }) => row.id)).toEqual([jane.body.id]);

    expect(unscoredBehavior.body.data.scores.overall).toBeNull();
    expect(ranking.body.data.items.map((item: Record<string, unknown>) => [item.driverId, item.rank, item.band])).toEqual([
      [john.body.id, 1, "excellent"],
      [jane.body.id, null, "unscored"],
    ]);
    expect(ranking.body.data.items[0].scores.overall).toBe(detailScore);
    expect(ranking.body.data.items[1].scores.overall).toBeNull();
    expect(summary.body.data).toMatchObject({ driversScored: 1, driversTotal: 2, averageScore: detailScore });
  }, 120_000);

  it("deletes a behaviour event recorded by mistake, only inside the tenant", async () => {
    const tenant = "tenant-behavior-delete";
    const http = () => request(app.getHttpServer());
    const recorded = await http()
      .post("/fleet/drivers/behavior/events")
      .set("Authorization", authToken("admin", tenant))
      .send({ driverId: "driver-test", type: "harsh_braking", severity: "critical" });
    expect(recorded.status).toBe(201);
    const path = `/fleet/drivers/behavior/events/${recorded.body.data.id}`;

    const elsewhere = await http().delete(path).set("Authorization", authToken("admin", "tenant-other"));
    expect(elsewhere.status).toBe(404);
    expect(elsewhere.body).toMatchObject({ status: false, statusCode: 404 });

    const deleted = await http().delete(path).set("Authorization", authToken("admin", tenant));
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toEqual({ id: recorded.body.data.id, driverId: "driver-test" });

    const events = await http().get("/fleet/drivers/behavior/events").set("Authorization", authToken("admin", tenant));
    expect(events.body.data.total).toBe(0);

    const again = await http().delete(path).set("Authorization", authToken("admin", tenant));
    expect(again.status).toBe(404);
  }, 60_000);

  it("POST /vehicles rejects unauthorized role", async () => {
    const response = await request(app.getHttpServer())
      .post("/fleet/vehicles")
      .set("Authorization", authToken("operator"))
      .set("Idempotency-Key", randomUUID())
      .send({
        registrationNumber: "TM-910",
        vin: "1HGCM82633A654321",
        make: "Scania",
        model: "R450",
        year: 2024,
        type: "truck",
        capacity: 20,
      });

    expect(response.status).toBe(403);
  });

  it("OPTIONS /vehicles exposes CORS preflight headers", async () => {
    const response = await request(app.getHttpServer())
      .options("/vehicles")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("serves the live tracking snapshot, vehicle search, alerts and a share link", async () => {
    const snapshot = await request(app.getHttpServer())
      .get("/fleet/tracking/live")
      .set("Authorization", authToken("admin"));
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.data.counts).toMatchObject({
      active: expect.any(Number),
      in_progress: expect.any(Number),
      idle: expect.any(Number),
      offline: expect.any(Number),
    });
    // The client needs the tick length to know how stale a frame may be.
    expect(snapshot.body.data.frameIntervalMs).toBeGreaterThan(0);

    const alerts = await request(app.getHttpServer())
      .get("/fleet/tracking/alerts?limit=5")
      .set("Authorization", authToken("admin"));
    expect(alerts.status).toBe(200);
    expect(Array.isArray(alerts.body.data.items)).toBe(true);

    const vehicle = await request(app.getHttpServer())
      .post("/fleet/vehicles")
      .set("Authorization", authToken("fleet_manager"))
      .send({ registrationNumber: "TM-771", make: "MAN", model: "TGS", type: "truck" });
    expect(vehicle.status).toBe(201);

    // A blank query returns the fleet; a nonsense one returns nothing.
    const searched = await request(app.getHttpServer())
      .get("/fleet/tracking/vehicles?query=TM771")
      .set("Authorization", authToken("admin"));
    expect(searched.status).toBe(200);
    expect(searched.body.data.vehicles).toHaveLength(1);

    const miss = await request(app.getHttpServer())
      .get("/fleet/tracking/vehicles?query=zzzzzz")
      .set("Authorization", authToken("admin"));
    expect(miss.body.data.vehicles).toHaveLength(0);
    // Counts describe the fleet, not the filter.
    expect(miss.body.data.counts.offline).toBeGreaterThan(0);

    const share = await request(app.getHttpServer())
      .post(`/fleet/tracking/vehicles/${vehicle.body.id}/share`)
      .set("Authorization", authToken("admin"));
    expect(share.status).toBe(201);
    expect(share.body.data.url).toContain("/track/");

    const token = String(share.body.data.url).split("/track/")[1];
    const publicView = await request(app.getHttpServer()).get(`/fleet/track/${token}`);
    expect(publicView.status).toBe(200);
    // A customer sees position and progress, never the plate or the driver.
    expect(publicView.body.data).not.toHaveProperty("registrationNumber");
    expect(publicView.body.data).toHaveProperty("expiresAt");

    // Minting again returns the existing link rather than a second live one.
    const again = await request(app.getHttpServer())
      .post(`/fleet/tracking/vehicles/${vehicle.body.id}/share`)
      .set("Authorization", authToken("admin"));
    expect(again.body.data.alreadyShared).toBe(true);
    expect(again.body.data.url).toBeNull();

    const bogus = await request(app.getHttpServer()).get("/fleet/track/not-a-real-token");
    expect(bogus.status).toBe(410);
  }, 120_000);

  it("records and edits fuel with one record shape, and exports a header row with no transactions", async () => {
    const server = app.getHttpServer();
    const empty = await request(server).get("/fleet/fuel/export").set("Authorization", authToken("admin", "fuel-empty"));
    expect(empty.status).toBe(200);
    expect(empty.text.split("\n")).toEqual([expect.stringMatching(/^id,tenantId,vehicleId,.*,totalCost,.*,driverName$/)]);

    const vehicle = await request(server)
      .post("/fleet/vehicles")
      .set("Authorization", authToken("admin"))
      .send({ registrationNumber: "FUEL-1", make: "Volvo", model: "FH", year: 2025, type: "truck", capacity: 10 });
    const created = await request(server)
      .post("/fleet/fuel")
      .set("Authorization", authToken("admin"))
      .send({ vehicleId: vehicle.body.id, liters: 10, pricePerLiter: 5 });
    expect(created.status).toBe(201);
    expect(created.body.data.totalCost).toBe(50);

    const edited = await request(server)
      .patch(`/fleet/fuel/${created.body.data.id}`)
      .set("Authorization", authToken("admin"))
      .send({ liters: 11 });
    expect(edited.status).toBe(200);
    expect(edited.body.data.totalCost).toBe(55);
    expect(Object.keys(created.body.data)).toEqual(Object.keys(edited.body.data));
  }, 60_000);
});
