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
  }, 15000);

  it("GET /fleet/alerts includes createdAt in alert responses", async () => {
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

    const bulkImport = await request(app.getHttpServer())
      .post("/fleet/devices/import")
      .set("Authorization", authToken("fleet_manager"))
      .send({
        items: [
          {
            imei: "359779090012400",
            manufacturer: "Queclink",
            model: "GV300",
            firmwareVersion: "1.0.0",
          },
        ],
      });
    expect(bulkImport.status).toBe(201);
    expect(bulkImport.body.created).toBe(1);

    const deleteDevice = await request(app.getHttpServer())
      .delete(`/fleet/devices/${createDevice.body.id}`)
      .set("Authorization", authToken("fleet_manager"));
    expect(deleteDevice.status).toBe(200);
    expect(deleteDevice.body.id).toBe(createDevice.body.id);
  }, 15000);

  it("supports bulk import and dispatcher search over vehicles and drivers", async () => {
    const importVehicles = await request(app.getHttpServer())
      .post("/fleet/vehicles/import")
      .set("Authorization", authToken("fleet_manager"))
      .set("Idempotency-Key", randomUUID())
      .send({
        items: [
          { plateNumber: "TM-111", model: "Scania R450" },
          { plateNumber: "TM-112", model: "MAN TGX", status: "inactive" },
        ],
      });
    expect(importVehicles.status).toBe(201);
    expect(importVehicles.body.created).toBe(2);

    const importDrivers = await request(app.getHttpServer())
      .post("/fleet/drivers/import")
      .set("Authorization", authToken("fleet_manager"))
      .set("Idempotency-Key", randomUUID())
      .send({
        items: [
          {
            firstName: "Driver",
            lastName: "One",
            phone: "+2348000000003",
            licenseNumber: "DRV-111",
            licenseExpiryDate: "2026-12-01",
            status: "available",
            contactChannels: { voiceNumber: "+2348000000003" },
          },
          {
            firstName: "Driver",
            lastName: "Two",
            phone: "+2348000000004",
            licenseNumber: "DRV-112",
            licenseExpiryDate: "2026-12-02",
            status: "offline",
          },
        ],
      });
    expect(importDrivers.status).toBe(201);
    expect(importDrivers.body.created).toBe(2);

    const search = await request(app.getHttpServer())
      .get("/fleet/dispatch/search?query=TM-11&driverStatus=active")
      .set("Authorization", authToken("dispatcher"));
    expect(search.status).toBe(200);
    expect(Array.isArray(search.body.vehicles)).toBe(true);
    expect(Array.isArray(search.body.drivers)).toBe(true);
  });

  it("POST /fleet/vehicles rejects unauthorized role", async () => {
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
