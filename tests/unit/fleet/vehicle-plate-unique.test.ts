import { describe, expect, it } from "vitest";
import { CreateVehicleUseCase } from "../../../apps/fleet/src/contexts/fleet/vehicles/application/use-cases/create-vehicle.use-case";
import { BulkImportVehiclesUseCase } from "../../../apps/fleet/src/contexts/fleet/vehicles/application/use-cases/bulk-import-vehicles.use-case";
import { InMemoryVehicleRepository } from "../../../apps/fleet/src/contexts/fleet/vehicles/infrastructure/repositories/in-memory-vehicle.repository";
import { FleetRuleError } from "../../../apps/fleet/src/contexts/fleet/shared/domain/errors/fleet-rule.error";

let counter = 0;
const runtime = { generateId: () => `veh-${++counter}`, getDefaultTenantId: () => "t1" } as never;
const quota = { assertRoomFor: async () => {} } as never;

describe("plate numbers are unique within a tenant", () => {
  it("create refuses a plate already held, whatever its case or padding", async () => {
    const repo = new InMemoryVehicleRepository();
    const useCase = new CreateVehicleUseCase(repo, runtime, quota);
    await useCase.execute({ plateNumber: "LAG-123-AB", model: "T" });

    await expect(useCase.execute({ plateNumber: " lag-123-ab ", model: "T" })).rejects.toBeInstanceOf(FleetRuleError);
    expect(await repo.findAll({ tenantId: "t1" })).toHaveLength(1);
  });

  it("bulk import refuses a file naming the same plate twice", async () => {
    const repo = new InMemoryVehicleRepository();
    const useCase = new BulkImportVehiclesUseCase(repo, runtime, quota);

    await expect(
      useCase.execute({ items: [{ plateNumber: "LAG-1", model: "T" }, { plateNumber: "lag-1", model: "T" }] }),
    ).rejects.toBeInstanceOf(FleetRuleError);
    expect(await repo.findAll({ tenantId: "t1" })).toHaveLength(0);
  });
});
