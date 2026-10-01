import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { DiscoveryService, Reflector } from "@nestjs/core";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";
import { Vehicle } from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/entities/vehicle.entity";
import { InMemoryVehicleRepository } from "../../../apps/fleet/src/contexts/fleet/vehicles/infrastructure/repositories/in-memory-vehicle.repository";
import { InternalFleetController } from "../../../apps/fleet/src/internal-fleet.controller";
import { assertTenantScopedControllers } from "../../../apps/fleet/src/assert-tenant-scoped";
import { AppModule } from "../../../apps/fleet/src/app.module";

const IMEI = "359779090012346";

function device(id: string, tenantId: string) {
  return Device.create({
    id,
    imei: IMEI,
    manufacturer: "Teltonika",
    model: "FMB920",
    firmwareVersion: "3.28.07",
    tenantId,
    lifecycleStatus: "configured",
    vehicleId: null,
    signalStrength: null,
    batteryLevel: null,
    lastSeen: null,
    assignedAt: null,
  });
}

function vehicle(id: string, tenantId: string) {
  return Vehicle.create({
    id,
    plateNumber: "LAG-123-AB",
    model: "Actros",
    tenantId,
    status: "active",
    assignedDriverId: null,
    ownerOperatorId: null,
    gpsDevice: null,
  });
}

async function harness() {
  const devices = new InMemoryDeviceRepository();
  const vehicles = new InMemoryVehicleRepository();
  await devices.save(device("dev-1", "tenant-a"));
  await vehicles.save(vehicle("veh-1", "tenant-a"));
  const controller = new InternalFleetController(
    {} as never, {} as never, vehicles, {} as never, devices, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, { fleet: { deviceOnlineThresholdSeconds: 600 } } as never,
  );
  return controller;
}

describe("support ticket context snapshot", () => {
  it("finds a device by its IMEI and names the resolved id", async () => {
    const controller = await harness();

    const result = await controller.contextSnapshot("tenant-a", "device", IMEI);

    expect(result.data).toMatchObject({ deviceId: "dev-1", imei: IMEI });
  });

  it("still finds a device by its id", async () => {
    const controller = await harness();

    const result = await controller.contextSnapshot("tenant-a", "device", "dev-1");

    expect(result.data).toMatchObject({ deviceId: "dev-1" });
  });

  it("finds a vehicle by its registration, in any case", async () => {
    const controller = await harness();

    const result = await controller.contextSnapshot("tenant-a", "vehicle", "lag-123-ab");

    expect(result.data).toMatchObject({ vehicleId: "veh-1", registrationNumber: "LAG-123-AB" });
  });

  it("does not reach another tenant's device by IMEI", async () => {
    const controller = await harness();

    await expect(controller.contextSnapshot("tenant-b", "device", IMEI)).rejects.toThrow("Record not found");
  });
});

describe("fleet tenant-scope boot check", () => {
  it("passes for every controller the app registers", () => {
    const controllers = (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AppModule) ?? []) as Function[];
    const discovery = { getControllers: () => controllers.map((metatype) => ({ metatype })) };
    const app = {
      get: (token: unknown) => (token === DiscoveryService ? discovery : new Reflector()),
    };

    expect(controllers).toContain(InternalFleetController);
    expect(() => assertTenantScopedControllers(app as never)).not.toThrow();
  });
});
