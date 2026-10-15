import { describe, expect, it, beforeEach } from "vitest";
import {
  CreateVehicleUseCase,
  VehicleQuotaExceededError,
} from "../../../apps/fleet/src/contexts/fleet/vehicles/application/use-cases/create-vehicle.use-case";
import { SetVehicleStatusUseCase } from "../../../apps/fleet/src/contexts/fleet/vehicles/application/use-cases/set-vehicle-status.use-case";
import { UpdateVehicleUseCase } from "../../../apps/fleet/src/contexts/fleet/vehicles/application/use-cases/update-vehicle.use-case";
import { BulkImportVehiclesUseCase } from "../../../apps/fleet/src/contexts/fleet/vehicles/application/use-cases/bulk-import-vehicles.use-case";
import { InMemoryDriverRepository } from "../../../apps/fleet/src/contexts/fleet/drivers/infrastructure/repositories/in-memory-driver.repository";
import { InMemoryVehicleRepository } from "../../../apps/fleet/src/contexts/fleet/vehicles/infrastructure/repositories/in-memory-vehicle.repository";
import { FleetQuotaExceededError } from "../../../apps/fleet/src/quota.service";

const runtime = {
  generateId: () => `veh-${Math.floor(performance.now() * 1000)}-${counter++}`,
  getDefaultTenantId: () => "tenant-a",
} as never;

let counter = 0;

/**
 * Stands in for the entitlement lookup. A null limit means the plan sets none,
 * which must not be read as zero.
 */
function quotaOf(limit: number | null) {
  return {
    assertRoomFor: async (_tenantId: string, resource: string, currentCount: number, additional: number) => {
      if (limit === null) return;
      if (currentCount + additional > limit) {
        throw new FleetQuotaExceededError(resource as never, limit, currentCount, additional);
      }
    },
  } as never;
}

describe("CreateVehicleUseCase quota enforcement", () => {
  let repo: InMemoryVehicleRepository;

  beforeEach(() => {
    repo = new InMemoryVehicleRepository();
    counter = 0;
  });

  function build(limit: number | null) {
    return new CreateVehicleUseCase(repo, runtime, quotaOf(limit));
  }

  async function seedActive(count: number) {
    const seeder = build(null);
    for (let i = 0; i < count; i++) {
      await seeder.execute({ plateNumber: `SEED-${i}`, model: `T-${i}`, tenantId: "tenant-a", status: "active" });
    }
  }

  it("allows a create below the plan limit", async () => {
    await seedActive(2);

    const created = await build(3).execute({ plateNumber: "NEW-1", model: "T-new", tenantId: "tenant-a" });

    expect(created.model).toBe("T-new");
    expect((await repo.findAll({ tenantId: "tenant-a", status: "active" })).length).toBe(3);
  });

  it("refuses the vehicle that would exceed the plan limit", async () => {
    await seedActive(3);

    await expect(
      build(3).execute({ plateNumber: "OVER-1", model: "T-over", tenantId: "tenant-a" }),
    ).rejects.toBeInstanceOf(VehicleQuotaExceededError);

    expect((await repo.findAll({ tenantId: "tenant-a", status: "active" })).length).toBe(3);
  });

  it("treats a null limit as unlimited", async () => {
    await seedActive(5);

    const created = await build(null).execute({ plateNumber: "UNL-1", model: "T-unlimited", tenantId: "tenant-a" });

    expect(created.id).toBeDefined();
  });

  it("distinguishes a zero limit from unlimited", async () => {
    await expect(
      build(0).execute({ plateNumber: "ZERO-1", model: "T-zero", tenantId: "tenant-a" }),
    ).rejects.toBeInstanceOf(VehicleQuotaExceededError);
  });

  it("still allows an inactive vehicle at the ceiling", async () => {
    await seedActive(3);

    const created = await build(3).execute({
      plateNumber: "INACT-1",
      model: "T-inactive",
      tenantId: "tenant-a",
      status: "inactive",
    });

    expect(created.status).toBe("inactive");
  });

  it("counts only the tenant's own active vehicles", async () => {
    const other = build(null);
    for (let i = 0; i < 4; i++) {
      await other.execute({ plateNumber: `OTHER-${i}`, model: `O-${i}`, tenantId: "tenant-b", status: "active" });
    }

    const created = await build(2).execute({ plateNumber: "FIRST-1", model: "T-first", tenantId: "tenant-a" });

    expect(created.model).toBe("T-first");
  });

  it("reports the limit and the current count on refusal", async () => {
    await seedActive(2);

    await expect(build(2).execute({ plateNumber: "X-1", model: "T-x", tenantId: "tenant-a" })).rejects.toThrow(
      /allows 2 active vehicles and 2 are already active/,
    );
  });
});

describe("activating a vehicle another way respects the quota", () => {
  let repo: InMemoryVehicleRepository;

  beforeEach(async () => {
    repo = new InMemoryVehicleRepository();
    const seeder = new CreateVehicleUseCase(repo, runtime, quotaOf(null));
    await seeder.execute({ plateNumber: "ACT-1", model: "T", tenantId: "tenant-a" });
    await seeder.execute({ plateNumber: "OFF-1", model: "T", tenantId: "tenant-a", status: "inactive" });
  });

  const inactiveId = async () => (await repo.findByPlateNumber("OFF-1", "tenant-a"))!.id;

  it("PATCH status refuses the activation past the limit", async () => {
    const useCase = new SetVehicleStatusUseCase(repo, new InMemoryDriverRepository(), quotaOf(1));
    await expect(
      useCase.execute({ id: await inactiveId(), tenantId: "tenant-a", status: "active" }),
    ).rejects.toBeInstanceOf(VehicleQuotaExceededError);
  });

  it("update refuses the activation past the limit", async () => {
    const useCase = new UpdateVehicleUseCase(repo, quotaOf(1));
    await expect(
      useCase.execute({ id: await inactiveId(), tenantId: "tenant-a", status: "active" }),
    ).rejects.toBeInstanceOf(VehicleQuotaExceededError);
  });

  it("bulk import refuses a file that would pass the limit and writes nothing", async () => {
    const useCase = new BulkImportVehiclesUseCase(repo, runtime, quotaOf(2));
    await expect(
      useCase.execute({
        tenantId: "tenant-a",
        items: [
          { plateNumber: "NEW-1", model: "T" },
          { plateNumber: "OFF-1", model: "T", status: "active" },
        ],
      }),
    ).rejects.toBeInstanceOf(VehicleQuotaExceededError);
    expect(await repo.findByPlateNumber("NEW-1", "tenant-a")).toBeNull();
  });
});
