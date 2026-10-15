import { describe, expect, it, vi } from "vitest";
import { CreateVehicleUseCase } from "../../../apps/fleet/src/contexts/fleet/vehicles/application/use-cases/create-vehicle.use-case";
import { ListVehiclesUseCase } from "../../../apps/fleet/src/contexts/fleet/vehicles/application/use-cases/list-vehicles.use-case";
import { InMemoryVehicleRepository } from "../../../apps/fleet/src/contexts/fleet/vehicles/infrastructure/repositories/in-memory-vehicle.repository";

let counter = 0;
const runtime = { generateId: () => `veh-${++counter}`, getDefaultTenantId: () => "t1" } as never;

describe("ListVehiclesUseCase driver names", () => {
  it("loads every assigned driver in one lookup", async () => {
    const vehicles = new InMemoryVehicleRepository();
    const create = new CreateVehicleUseCase(vehicles, runtime, { assertRoomFor: async () => {} } as never);
    for (const [plate, driverId] of [["A-1", "d1"], ["A-2", "d2"], ["A-3", null]] as const) {
      const vehicle = await create.execute({ plateNumber: plate, model: "T", tenantId: "t1" });
      if (driverId) await vehicles.save((await vehicles.findById(vehicle.id, "t1"))!.assignDriver(driverId));
    }
    const drivers = {
      findById: vi.fn(),
      findByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, name: `Driver ${id}` }))),
    };

    const list = await new ListVehiclesUseCase(vehicles, drivers as never).execute({ tenantId: "t1" });

    expect(drivers.findById).not.toHaveBeenCalled();
    expect(drivers.findByIds).toHaveBeenCalledTimes(1);
    expect(list.map((v) => v.assignedDriverName).sort()).toEqual(["Driver d1", "Driver d2", null]);
  });
});
