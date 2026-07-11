import { describe, expect, it, beforeEach } from "vitest";
import { MaintenanceRecordsUseCase } from "../../../apps/fleet/src/maintenance-records.use-case";
import type { VehicleRepository } from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import type { MaintenanceRecordRepository, StoredMaintenanceRecord } from "../../../apps/fleet/src/maintenance-record.repository";

const TENANT = "t1";
const VEHICLE_UUID = "11111111-1111-1111-1111-111111111111";
const PLATE = "LAG-234-XY";

function fakeVehicle() {
  return {
    id: VEHICLE_UUID,
    plateNumber: PLATE,
    registrationNumber: PLATE,
    toPrimitives: () => ({ id: VEHICLE_UUID, plateNumber: PLATE, registrationNumber: PLATE }),
  } as never;
}

function fakeVehicleRepo(): VehicleRepository {
  const vehicle = fakeVehicle();
  return {
    save: async () => {},
    findAll: async () => [],
    findById: async (id: string) => (id === VEHICLE_UUID ? vehicle : null),
    findByPlateNumber: async (plate: string, tenantId: string) =>
      plate === PLATE && tenantId === TENANT ? vehicle : null,
    findByAssignedDriverId: async () => null,
    deleteById: async () => {},
  } as VehicleRepository;
}

function fakeMaintenanceRepo(seed: StoredMaintenanceRecord[] = []): MaintenanceRecordRepository {
  const store = new Map(seed.map((r) => [r.id, r]));
  return {
    save: async (r: StoredMaintenanceRecord) => {
      store.set(r.id, r);
    },
    findById: async (id: string) => store.get(id) ?? null,
    findAllByTenant: async (tenantId: string) => [...store.values()].filter((r) => r.tenantId === tenantId),
    deleteById: async (id: string) => {
      store.delete(id);
    },
  };
}

describe("MaintenanceRecordsUseCase — vehicle resolution (issue 4)", () => {
  let vehicleRepo: VehicleRepository;

  beforeEach(() => {
    vehicleRepo = fakeVehicleRepo();
  });

  it("create() resolves a plate/registration string to the real vehicle UUID", async () => {
    const maintRepo = fakeMaintenanceRepo();
    const useCase = new MaintenanceRecordsUseCase(maintRepo, vehicleRepo);

    const record = await useCase.create(TENANT, {
      vehicleId: PLATE, // UI submits the registration, not a UUID
      maintenanceType: "corrective",
      priority: "medium",
    } as never);

    expect(record.vehicleId).toBe(VEHICLE_UUID);
  });

  it("list() enriches plate/reg even for a legacy row whose vehicleId is a plate string", async () => {
    const legacy: StoredMaintenanceRecord = {
      id: "rec-1",
      tenantId: TENANT,
      vehicleId: PLATE, // already-broken stored value
      maintenanceType: "corrective",
      status: "scheduled",
      priority: "medium",
      currency: "NGN",
      description: null,
      scheduledDate: null,
      completedDate: null,
      cost: null,
      technician: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never;
    const useCase = new MaintenanceRecordsUseCase(fakeMaintenanceRepo([legacy]), vehicleRepo);

    const [enriched] = await useCase.list(TENANT);
    expect(enriched.vehiclePlateNumber).toBe(PLATE);
    expect(enriched.vehicleRegistrationNumber).toBe(PLATE);
  });

  it("enrichment returns null (not a crash) when the vehicle truly can't be found", async () => {
    const orphan: StoredMaintenanceRecord = {
      id: "rec-2",
      tenantId: TENANT,
      vehicleId: "UNKNOWN VALUE",
      maintenanceType: "corrective",
      status: "scheduled",
      priority: "medium",
      currency: "NGN",
      description: null,
      scheduledDate: null,
      completedDate: null,
      cost: null,
      technician: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never;
    const useCase = new MaintenanceRecordsUseCase(fakeMaintenanceRepo([orphan]), vehicleRepo);

    const [enriched] = await useCase.list(TENANT);
    expect(enriched.vehiclePlateNumber).toBeNull();
    expect(enriched.vehicleRegistrationNumber).toBeNull();
  });
});
