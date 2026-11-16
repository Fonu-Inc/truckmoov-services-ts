import { describe, expect, it, vi } from "vitest";
import { ListVehicleTripsUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/list-vehicle-trips.use-case";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";

describe("ListVehicleTripsUseCase", () => {
  // The IMEI's Traccar device may carry trips from a previous tenant.
  it("never asks Traccar for history from before the device was assigned here", async () => {
    const assignedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const devices = new InMemoryDeviceRepository();
    await devices.save(
      Device.create({
        id: "dev-1",
        imei: "359779090012345",
        manufacturer: "Teltonika",
        model: "FMB920",
        firmwareVersion: "3.28.07",
        tenantId: "tenant-a",
        lifecycleStatus: "assigned",
        vehicleId: "v1",
        signalStrength: null,
        batteryLevel: null,
        lastSeen: null,
        assignedAt,
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        traccarDeviceId: "tc-1",
      }),
    );
    const trips = { getTrips: vi.fn(async () => []) };

    await new ListVehicleTripsUseCase(devices, trips).execute("v1", "tenant-a");

    expect(trips.getTrips).toHaveBeenCalledWith("tc-1", new Date(assignedAt), expect.any(Date));
  });
});
