import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryVehicleRepository } from "../../../apps/fleet/src/contexts/fleet/vehicles/infrastructure/repositories/in-memory-vehicle.repository";
import { Vehicle } from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/entities/vehicle.entity";

function makeVehicle(id: string, tenantId = "t1", overrides: Partial<Parameters<typeof Vehicle.create>[0]> = {}) {
  return Vehicle.create({ id, plateNumber: `PLATE-${id}`, model: "Truck", tenantId, status: "active", assignedDriverId: null, gpsDevice: null, ...overrides });
}

describe("InMemoryVehicleRepository", () => {
  let repo: InMemoryVehicleRepository;
  beforeEach(() => { repo = new InMemoryVehicleRepository(); });

  it("saves and retrieves by id", async () => {
    const v = makeVehicle("v1");
    await repo.save(v);
    expect(await repo.findById("v1")).toBe(v);
  });

  it("returns null for missing id", async () => {
    expect(await repo.findById("missing")).toBeNull();
  });

  it("findAll filters by tenantId", async () => {
    await repo.save(makeVehicle("v1", "t1"));
    await repo.save(makeVehicle("v2", "t2"));
    expect(await repo.findAll({ tenantId: "t1" })).toHaveLength(1);
  });

  it("findAll filters by status", async () => {
    await repo.save(makeVehicle("v1", "t1", { status: "active" }));
    await repo.save(makeVehicle("v2", "t1", { status: "inactive" }));
    expect(await repo.findAll({ status: "inactive" })).toHaveLength(1);
  });

  it("findAll filters by assigned", async () => {
    await repo.save(makeVehicle("v1", "t1", { assignedDriverId: "d1" }));
    await repo.save(makeVehicle("v2", "t1"));
    expect(await repo.findAll({ assigned: true })).toHaveLength(1);
    expect(await repo.findAll({ assigned: false })).toHaveLength(1);
  });

  it("findAll search query matches plateNumber", async () => {
    await repo.save(makeVehicle("v1", "t1", { plateNumber: "ABC-123" }));
    await repo.save(makeVehicle("v2", "t1", { plateNumber: "XYZ-999" }));
    expect(await repo.findAll({ query: "abc" })).toHaveLength(1);
  });

  it("findByPlateNumber is case insensitive and tenant-scoped", async () => {
    await repo.save(makeVehicle("v1", "t1", { plateNumber: "LND-001" }));
    expect(await repo.findByPlateNumber("lnd-001", "t1")).not.toBeNull();
    expect(await repo.findByPlateNumber("LND-001", "t2")).toBeNull();
  });

  it("findByAssignedDriverId returns vehicle for driver", async () => {
    await repo.save(makeVehicle("v1", "t1", { assignedDriverId: "d1" }));
    expect(await repo.findByAssignedDriverId("d1")).not.toBeNull();
  });

  it("deleteById removes the vehicle", async () => {
    await repo.save(makeVehicle("v1"));
    await repo.deleteById("v1");
    expect(await repo.findById("v1")).toBeNull();
  });
});
