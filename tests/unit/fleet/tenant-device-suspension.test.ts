import { describe, expect, it } from "vitest";
import {
  ReinstateDeviceUseCase,
  SuspendDeviceUseCase,
} from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/suspend-device.use-cases";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";
import { Migration20261001020000 } from "../../../apps/fleet/src/migrations/Migration20261001020000";

async function setup() {
  const devices = new InMemoryDeviceRepository();
  await devices.save(
    Device.create({
      id: "d1", imei: "359779090012345", manufacturer: "Teltonika", model: "FMC130", firmwareVersion: "1.0.0",
      tenantId: "tenant-a", lifecycleStatus: "assignable", vehicleId: null, signalStrength: null, batteryLevel: null,
      lastSeen: null, assignedAt: null,
    }),
  );
  const vehicles = { findById: async () => null, save: async () => {} } as never;
  const publisher = { publish: async () => {} } as never;
  return {
    suspend: new SuspendDeviceUseCase(devices, vehicles, publisher),
    reinstate: new ReinstateDeviceUseCase(devices, publisher),
  };
}

describe("tenant device suspension", () => {
  it("records the tenant as the suspender and lets it reinstate", async () => {
    const { suspend, reinstate } = await setup();

    expect(await suspend.execute("d1", "stolen", "tenant-a")).toMatchObject({ lifecycleStatus: "suspended", suspendedBy: "tenant" });
    expect(await reinstate.execute("d1", "tenant-a")).toMatchObject({ lifecycleStatus: "assignable", suspendedBy: null });
  });

  it("cannot reach another tenant's device", async () => {
    const { suspend } = await setup();

    await expect(suspend.execute("d1", null, "tenant-b")).rejects.toThrow(/d1/);
  });

  it("cannot lift what the platform imposed", async () => {
    const { suspend, reinstate } = await setup();
    await suspend.execute("d1", "non-payment");

    await expect(reinstate.execute("d1", "tenant-a")).rejects.toThrow(/only the platform/);
  });
});

describe("suspended_by migration", () => {
  it("marks every existing suspension as the platform's", () => {
    const migration = new Migration20261001020000(null as never, null as never);
    migration.up();
    const [column, backfill] = migration.getQueries().map(String);

    expect(column).toContain('add column if not exists "suspended_by"');
    expect(backfill).toContain(`"suspended_by" = 'platform' where "lifecycle_status" = 'suspended'`);
  });
});
