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
    expect(response.body).toEqual({
      status: true,
      message: "success",
      data: { service: "fleet" },
    });
  });

  it("supports assignment, activation, contact channels, and GPS mapping", async () => {
    const createVehicle = await request(app.getHttpServer())
      .post("/fleet/vehicles")
      .set("x-user-role", "admin")
      .set("Idempotency-Key", randomUUID())
      .send({
        plateNumber: "TM-909",
        model: "Volvo FH",
        tenantId: "default",
      });
    expect(createVehicle.status).toBe(201);

    const createDriver = await request(app.getHttpServer())
      .post("/fleet/drivers")
      .set("x-user-role", "admin")
      .set("Idempotency-Key", randomUUID())
      .send({
        name: "Ayo Dispatcher",
        licenseNumber: "LIC-909",
        tenantId: "default",
      });
    expect(createDriver.status).toBe(201);

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
        deviceId: "GPS-001",
        provider: "Teltonika",
        serialNumber: "SN-001",
      });
    expect(gpsUpdate.status).toBe(200);
    expect(gpsUpdate.body.gpsDevice.deviceId).toBe("GPS-001");

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
            name: "Driver One",
            licenseNumber: "DRV-111",
            contactChannels: { voiceNumber: "+2348000000003" },
          },
          {
            name: "Driver Two",
            licenseNumber: "DRV-112",
            status: "inactive",
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
        plateNumber: "TM-910",
        model: "Scania R450",
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
