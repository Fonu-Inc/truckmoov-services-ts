import { describe, expect, it } from "vitest";
import { CreateDeviceUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/create-device.use-case";
import { BulkImportDevicesUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/bulk-import-devices.use-case";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";
import { FleetRuleError } from "../../../apps/fleet/src/contexts/fleet/shared/domain/errors/fleet-rule.error";

const IMEI = "359779090012345";
const runtime = { generateId: () => "dev-new", getDefaultTenantId: () => "t2" } as never;
const quota = { assertWithinQuota: async () => {}, assertRoomFor: async () => {} } as never;
const publisher = { publish: async () => {} };
const provisioner = { register: async () => null, deregister: async () => {} };

async function repoWithOtherTenantDevice() {
  const repo = new InMemoryDeviceRepository();
  await repo.save(
    Device.create({
      id: "dev-a",
      imei: IMEI,
      manufacturer: "Teltonika",
      model: "FMC130",
      firmwareVersion: "1",
      tenantId: "t1",
      lifecycleStatus: "registered",
      vehicleId: null,
      signalStrength: null,
      batteryLevel: null,
      lastSeen: null,
      assignedAt: null,
    }),
  );
  return repo;
}

describe("IMEI held live by another tenant", () => {
  it("create refuses it", async () => {
    const repo = await repoWithOtherTenantDevice();
    const useCase = new CreateDeviceUseCase(repo, runtime, provisioner, publisher, quota);
    await expect(
      useCase.execute({ imei: IMEI, manufacturer: "Teltonika", model: "FMC130", firmwareVersion: "1" }),
    ).rejects.toBeInstanceOf(FleetRuleError);
    expect(await repo.findAll({ tenantId: "t2" })).toHaveLength(0);
  });

  it("bulk import refuses it", async () => {
    const repo = await repoWithOtherTenantDevice();
    const useCase = new BulkImportDevicesUseCase(repo, runtime, publisher, quota);
    await expect(
      useCase.execute({ rows: [{ imei: IMEI, name: null, manufacturer: "Teltonika", model: "FMC130" }] as never }),
    ).rejects.toBeInstanceOf(FleetRuleError);
    expect(await repo.findAll({ tenantId: "t2" })).toHaveLength(0);
  });
});
