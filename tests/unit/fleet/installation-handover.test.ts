import { beforeEach, describe, expect, it, vi } from "vitest";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";
import { StartDeviceVerificationUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/start-device-verification.use-case";
import { AssignDeviceToVehicleUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/assign-device-to-vehicle.use-case";
import { InstallationHandoverUseCases } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/installation-handover.use-cases";
import { CreateVehicleUseCase } from "../../../apps/fleet/src/contexts/fleet/vehicles/application/use-cases/create-vehicle.use-case";
import { InMemoryVehicleRepository } from "../../../apps/fleet/src/contexts/fleet/vehicles/infrastructure/repositories/in-memory-vehicle.repository";
import { FleetRuleError } from "../../../apps/fleet/src/contexts/fleet/shared/domain/errors/fleet-rule.error";

const TENANT = "tenant-1";
const VEHICLE = {
  registrationNumber: "LSD-123-XA",
  vehicleType: "bus",
  make: "Mercedes-Benz",
  model: "Actros 1844",
  year: 1970,
  chassisNumber: "WDB96",
};

function device(id: string, overrides: Partial<Parameters<typeof Device.create>[0]> = {}) {
  return Device.create({
    id,
    imei: "359779090012345",
    manufacturer: "Teltonika",
    model: "FMB920",
    firmwareVersion: "3.28.07",
    tenantId: TENANT,
    lifecycleStatus: "configured",
    vehicleId: null,
    signalStrength: null,
    batteryLevel: null,
    lastSeen: null,
    assignedAt: null,
    ...overrides,
  });
}

describe("installation handover", () => {
  let devices: InMemoryDeviceRepository;
  let vehicles: InMemoryVehicleRepository;
  let handover: InstallationHandoverUseCases;
  let ids = 0;

  beforeEach(() => {
    devices = new InMemoryDeviceRepository();
    vehicles = new InMemoryVehicleRepository();
    const runtime = { generateId: () => `veh-${++ids}`, getDefaultTenantId: () => TENANT } as never;
    const config = { fleet: { deviceVerificationWindowMinutes: 30 } } as never;
    handover = new InstallationHandoverUseCases(
      devices,
      vehicles,
      new StartDeviceVerificationUseCase(devices, config),
      new CreateVehicleUseCase(vehicles, runtime, { assertWithinQuota: async () => {} } as never),
      new AssignDeviceToVehicleUseCase(devices, vehicles, { publish: vi.fn(async () => {}) } as never),
    );
  });

  it("opens verification on configured devices and skips, refuses or misses the rest", async () => {
    await devices.save(device("dev-1"));
    await devices.save(device("dev-2", { verificationStatus: "waiting", verificationDeadline: new Date().toISOString() }));
    await devices.save(device("dev-3", { lifecycleStatus: "registered" }));
    await devices.save(device("dev-4", { tenantId: "tenant-2" }));

    const results = await handover.beginVerification(TENANT, ["dev-1", "dev-2", "dev-3", "dev-4"]);

    expect(results.map((r) => [r.deviceId, r.outcome])).toEqual([
      ["dev-1", "started"],
      ["dev-2", "skipped"],
      ["dev-3", "refused"],
      ["dev-4", "missing"],
    ]);
    expect((await devices.findById("dev-1", TENANT))?.verificationStatus).toBe("waiting");
  });

  it("creates the vehicle once per registration and assigns the verified device", async () => {
    await devices.save(device("dev-1", { lifecycleStatus: "verified_online", verificationStatus: "verified" }));

    const first = await handover.handOver(TENANT, { deviceId: "dev-1", vehicle: VEHICLE });
    const again = await handover.handOver(TENANT, { deviceId: "dev-1", vehicle: VEHICLE });

    expect(again.vehicleId).toBe(first.vehicleId);
    expect(await vehicles.findAll({ tenantId: TENANT })).toHaveLength(1);
    const vehicle = await vehicles.findByPlateNumber("LSD-123-XA", TENANT);
    expect(vehicle?.toPrimitives()).toMatchObject({ make: "Mercedes-Benz", model: "Actros 1844", year: null, type: null, vin: null });
    expect((await devices.findById("dev-1", TENANT))?.toPrimitives()).toMatchObject({ lifecycleStatus: "assigned", vehicleId: first.vehicleId });
  });

  it("refuses a device that is not verified", async () => {
    await devices.save(device("dev-1"));

    await expect(handover.handOver(TENANT, { deviceId: "dev-1", vehicle: VEHICLE })).rejects.toBeInstanceOf(FleetRuleError);
  });
});
