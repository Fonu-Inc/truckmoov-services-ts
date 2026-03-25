import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCorsOptions } from "@shared/http";

process.env.PERSISTENCE_BACKEND = "in-memory";

describe("Fleet HTTP contract", () => {
  let app: INestApplication;
  const previousBackend = process.env.PERSISTENCE_BACKEND;

  beforeAll(async () => {
    process.env.PERSISTENCE_BACKEND = "in-memory";
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
    const response = await request(app.getHttpServer()).get("/fleet/test-sentry");
    expect(response.status).toBe(500);
  });

  it("supports assignment, activation, contact channels, and GPS mapping", async () => {
    const createVehicle = await request(app.getHttpServer())
      .post("/fleet/vehicles")
      .set("x-user-role", "admin")
      .set("Idempotency-Key", randomUUID())
      .send({
        registrationNumber: "TM-909",
        vin: "1HGCM82633A123456",
        make: "Volvo",
        model: "FH",
        year: 2025,
        type: "truck",
        capacity: 18,
        tenantId: "default",
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
      .set("x-user-role", "dispatcher");
    expect(fetchedVehicle.status).toBe(200);
    expect(fetchedVehicle.body.registrationNumber).toBe("TM-909");
    expect(fetchedVehicle.body.vin).toBe("1HGCM82633A123456");
    expect(fetchedVehicle.body.make).toBe("Volvo");

    const createDriver = await request(app.getHttpServer())
      .post("/fleet/drivers")
      .set("x-user-role", "admin")
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
        tenantId: "default",
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
      .set("x-user-role", "dispatcher")
      .set("Idempotency-Key", randomUUID())
      .send({
        driverId: createDriver.body.id,
      });
    expect(assignment.status).toBe(200);
    expect(assignment.body.vehicle.assignedDriverId).toBe(createDriver.body.id);
    expect(assignment.body.driver.assignedVehicleId).toBe(createVehicle.body.id);

    const gpsUpdate = await request(app.getHttpServer())
      .patch(`/fleet/vehicles/${createVehicle.body.id}/gps-device`)
      .set("x-user-role", "fleet_manager")
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
      .set("x-user-role", "dispatcher");
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
      tenantId: "default",
    });

    const contactUpdate = await request(app.getHttpServer())
      .patch(`/fleet/drivers/${createDriver.body.id}/contact-channels`)
      .set("x-user-role", "dispatcher")
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
      .set("x-user-role", "fleet_manager")
      .set("Idempotency-Key", randomUUID())
      .send({ status: "inactive" });
    expect(deactivateVehicle.status).toBe(200);
    expect(deactivateVehicle.body.status).toBe("inactive");

    const driverAfterDeactivate = await request(app.getHttpServer())
      .get(`/fleet/drivers/${createDriver.body.id}`)
      .set("x-user-role", "dispatcher");
    expect(driverAfterDeactivate.status).toBe(200);
    expect(driverAfterDeactivate.body.assignedVehicleId).toBeNull();
  });

  it("supports bulk import and dispatcher search over vehicles, drivers, and jobs", async () => {
    const importVehicles = await request(app.getHttpServer())
      .post("/fleet/vehicles/import")
      .set("x-user-role", "fleet_manager")
      .set("Idempotency-Key", randomUUID())
      .send({
        tenantId: "default",
        items: [
          { plateNumber: "TM-111", model: "Scania R450" },
          { plateNumber: "TM-112", model: "MAN TGX", status: "inactive" },
        ],
      });
    expect(importVehicles.status).toBe(201);
    expect(importVehicles.body.created).toBe(2);

    const importDrivers = await request(app.getHttpServer())
      .post("/fleet/drivers/import")
      .set("x-user-role", "fleet_manager")
      .set("Idempotency-Key", randomUUID())
      .send({
        tenantId: "default",
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

    const eventResponse = await request(app.getHttpServer())
      .post("/fleet/events/job-status?jobId=job-1&status=assigned")
      .set("x-user-role", "dispatcher")
      .set("Idempotency-Key", randomUUID());
    expect(eventResponse.status).toBe(201);
    expect(eventResponse.body.published).toBe(true);

    const jobs = await request(app.getHttpServer())
      .get("/fleet/jobs?status=assigned")
      .set("x-user-role", "dispatcher");
    expect(jobs.status).toBe(200);
    expect(jobs.body.length).toBeGreaterThanOrEqual(1);
    expect(jobs.body[0]?.jobId).toBe("job-1");

    const search = await request(app.getHttpServer())
      .get("/fleet/dispatch/search?query=TM-11&driverStatus=active")
      .set("x-user-role", "dispatcher");
    expect(search.status).toBe(200);
    expect(Array.isArray(search.body.vehicles)).toBe(true);
    expect(Array.isArray(search.body.drivers)).toBe(true);
    expect(Array.isArray(search.body.jobs)).toBe(true);
  });

  it("POST /fleet/vehicles rejects unauthorized role", async () => {
    const response = await request(app.getHttpServer())
      .post("/fleet/vehicles")
      .set("x-user-role", "operator")
      .set("Idempotency-Key", randomUUID())
      .send({
        registrationNumber: "TM-910",
        vin: "1HGCM82633A654321",
        make: "Scania",
        model: "R450",
        year: 2024,
        type: "truck",
        capacity: 20,
        tenantId: "default",
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
