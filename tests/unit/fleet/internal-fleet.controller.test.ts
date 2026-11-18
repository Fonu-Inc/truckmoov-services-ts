import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { DiscoveryService, Reflector } from "@nestjs/core";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";
import { Vehicle } from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/entities/vehicle.entity";
import { InMemoryVehicleRepository } from "../../../apps/fleet/src/contexts/fleet/vehicles/infrastructure/repositories/in-memory-vehicle.repository";
import { DeviceIdentityDirectory } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/device-identity-directory.use-case";
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

async function identityHarness() {
  const devices = new InMemoryDeviceRepository();
  await devices.save(device("dev-1", "tenant-a"));
  await devices.save(Device.create({ ...device("dev-2", "tenant-a").toPrimitives(), imei: "359779090012347", lifecycleStatus: "assigned", vehicleId: "veh-2" }));
  await devices.save(Device.create({ ...device("dev-3", "tenant-b").toPrimitives(), imei: "359779090012348", lifecycleStatus: "decommissioned" }));
  return new InternalFleetController(
    {} as never, {} as never, {} as never, {} as never, devices, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, new DeviceIdentityDirectory(devices),
  );
}

describe("device identity snapshot", () => {
  it("pages live devices by id and skips decommissioned ones", async () => {
    const controller = await identityHarness();

    const first = await controller.deviceIdentities("1");
    expect(first.data.identities).toEqual([
      { imei: IMEI, tenantId: "tenant-a", vehicleId: null, deviceId: "dev-1", status: expect.any(String) },
    ]);
    expect(first.data.nextCursor).toBe("dev-1");

    const second = await controller.deviceIdentities("1", first.data.nextCursor!);
    expect(second.data.identities.map((entry) => entry.deviceId)).toEqual(["dev-2"]);
    expect(second.data.identities[0].vehicleId).toBe("veh-2");

    const rest = await controller.deviceIdentities("5", "dev-2");
    expect(rest.data.identities).toEqual([]);
    expect(rest.data.nextCursor).toBeNull();
  });

  it("caps the page size", async () => {
    const controller = await identityHarness();
    const result = await controller.deviceIdentities("999999");
    expect(result.data.identities).toHaveLength(2);
  });

  it("looks one device up by IMEI", async () => {
    const controller = await identityHarness();
    const result = await controller.deviceIdentity("359779090012347");
    expect(result.data).toMatchObject({ deviceId: "dev-2", tenantId: "tenant-a", vehicleId: "veh-2" });
  });

  it("answers 404 for an unknown or decommissioned IMEI", async () => {
    const controller = await identityHarness();
    await expect(controller.deviceIdentity("000000000000000")).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.deviceIdentity("359779090012348")).rejects.toBeInstanceOf(NotFoundException);
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

describe("live socket scope for owner operators", () => {
  async function scopeHarness(access: unknown) {
    const vehicles = new InMemoryVehicleRepository();
    await vehicles.save(Vehicle.create({
      id: "veh-own", plateNumber: "LAG-1", model: "Actros", tenantId: "tenant-a", status: "active",
      assignedDriverId: null, ownerOperatorId: "op-1", gpsDevice: null,
    }));
    await vehicles.save(vehicle("veh-other", "tenant-a"));
    return new InternalFleetController(
      {} as never, {} as never, vehicles, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, { get: async () => access } as never,
    );
  }
  const realtime = { user: { service: "realtime", tenantId: "tenant-a", role: "DISPATCHER" } } as never;

  it("lists only the operator's own vehicles inside another organisation", async () => {
    const controller = await scopeHarness({ tenantId: "tenant-a", active: true, organizationType: "aggregator" });
    expect((await controller.liveScope(realtime, "op-1")).data.vehicleIds).toEqual(["veh-own"]);
  });

  it("narrows when auth cannot say what organisation they are in", async () => {
    const controller = await scopeHarness(undefined);
    expect((await controller.liveScope(realtime, "op-1")).data.vehicleIds).toEqual(["veh-own"]);
  });

  it("gives the whole tenant to the owner of an owner-operator organisation", async () => {
    const controller = await scopeHarness({ tenantId: "tenant-a", active: true, organizationType: "owner_operator" });
    expect((await controller.liveScope(realtime, "op-1")).data.vehicleIds).toBeNull();
  });

  it("answers the notification service the same way", async () => {
    const controller = await scopeHarness({ tenantId: "tenant-a", active: true, organizationType: "aggregator" });
    const notification = { user: { service: "notification", tenantId: "tenant-a", role: "DISPATCHER" } } as never;
    expect((await controller.liveScope(notification, "op-1")).data.vehicleIds).toEqual(["veh-own"]);
  });

  it("refuses another tenant's user and any caller but realtime and notification", async () => {
    const controller = await scopeHarness({ tenantId: "tenant-b", active: true, organizationType: "aggregator" });
    await expect(controller.liveScope(realtime, "op-1")).rejects.toBeInstanceOf(NotFoundException);
    const dispatch = { user: { service: "dispatch", tenantId: "tenant-a", role: "FLEET_ADMIN" } } as never;
    await expect(controller.liveScope(dispatch, "op-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});
