import { ConflictException, NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { Role, ROLES_KEY } from "@shared/rbac";
import { FuelController } from "../../../apps/fleet/src/fuel.controller";
import { MaintenanceController } from "../../../apps/fleet/src/maintenance.controller";
import { VehiclesController } from "../../../apps/fleet/src/vehicles.controller";
import { CreateVehicleDto } from "../../../apps/fleet/src/dto/vehicle.dto";
import { FuelRecord } from "../../../apps/fleet/src/contexts/fleet/fuel/domain/entities/fuel-record.entity";
import { FuelRecordNotFoundError } from "../../../apps/fleet/src/contexts/fleet/fuel/domain/errors/fuel-record-not-found.error";
import { InMemoryFuelRecordRepository } from "../../../apps/fleet/src/contexts/fleet/fuel/infrastructure/in-memory-fuel-record.repository";
import { UpdateFuelRecordUseCase } from "../../../apps/fleet/src/contexts/fleet/fuel/application/update-fuel-record.use-case";
import { DeleteFuelRecordUseCase } from "../../../apps/fleet/src/contexts/fleet/fuel/application/delete-fuel-record.use-case";
import { BulkImportVehiclesUseCase } from "../../../apps/fleet/src/contexts/fleet/vehicles/application/use-cases/bulk-import-vehicles.use-case";
import { InMemoryVehicleRepository } from "../../../apps/fleet/src/contexts/fleet/vehicles/infrastructure/repositories/in-memory-vehicle.repository";

const rolesOf = (controller: object, method: string) =>
  Reflect.getMetadata(ROLES_KEY, (controller as { prototype: Record<string, unknown> }).prototype[method] as object) as string[];

describe("the routes an owner operator was refused on", () => {
  it.each([
    ["vehicles", VehiclesController, "createVehicle"],
    ["vehicles", VehiclesController, "bulkImportVehicles"],
    ["vehicles", VehiclesController, "updateVehicle"],
    ["vehicles", VehiclesController, "deleteVehicle"],
    ["fuel", FuelController, "recordFuel"],
    ["fuel", FuelController, "exportFuel"],
    ["fuel", FuelController, "updateFuel"],
    ["fuel", FuelController, "deleteFuel"],
    ["maintenance", MaintenanceController, "sendMaintenanceReminders"],
  ] as const)("%s %s allows OWNER_OPERATOR", (_area, controller, method) => {
    const handler = (controller.prototype as unknown as Record<string, unknown>)[method];
    expect(handler, `${method} must exist on the controller`).toBeTypeOf("function");
    expect(rolesOf(controller, method)).toContain(Role.OWNER_OPERATOR);
  });

  it("keeps the roles that already had access", () => {
    expect(rolesOf(VehiclesController, "createVehicle")).toEqual(
      expect.arrayContaining([Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR]),
    );
    expect(rolesOf(FuelController, "deleteFuel")).toEqual(expect.arrayContaining([Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR]));
  });
});

const owner = { user: { tenantId: "t1", userId: "op-1", role: Role.OWNER_OPERATOR } } as never;
const admin = { user: { tenantId: "t1", userId: "adm", role: Role.ENTERPRISE_ADMIN } } as never;

function vehicles(controllerOverrides: Record<string, unknown>) {
  const controller = Object.assign(Object.create(VehiclesController.prototype), {
    recordActivity: vi.fn(async () => undefined),
    ...controllerOverrides,
  }) as VehiclesController;
  return controller;
}

const lister = (rows: Array<Record<string, unknown>>) => ({
  execute: vi.fn(async (query: { ownerOperatorId?: string }) =>
    query.ownerOperatorId ? rows.filter((row) => row["ownerOperatorId"] === query.ownerOperatorId) : rows,
  ),
});

describe("an owner operator's vehicle writes", () => {
  it("stamps the vehicle they create with their own id, so it shows in their list", async () => {
    const create = vi.fn(async () => ({ id: "v9", plateNumber: "A", registrationNumber: "A", model: "M", status: "active" }));
    const controller = vehicles({ createVehicleUseCase: { execute: create } });

    await controller.createVehicle({ model: "M", registrationNumber: "A" } as never, owner);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ ownerOperatorId: "op-1", tenantId: "t1" }));
  });

  it("leaves the owner empty when an admin creates a vehicle", async () => {
    const create = vi.fn(async () => ({ id: "v9", plateNumber: "A", registrationNumber: "A", model: "M", status: "active" }));
    const controller = vehicles({ createVehicleUseCase: { execute: create } });

    await controller.createVehicle({ model: "M", registrationNumber: "A" } as never, admin);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ ownerOperatorId: undefined }));
  });

  it("updates and deletes a vehicle they own", async () => {
    const update = vi.fn(async () => ({ id: "v1" }));
    const remove = vi.fn(async () => ({ id: "v1" }));
    const controller = vehicles({
      listVehiclesUseCase: lister([{ id: "v1", ownerOperatorId: "op-1" }]),
      updateVehicleUseCase: { execute: update },
      deleteVehicleUseCase: { execute: remove },
    });

    await controller.updateVehicle("v1", { model: "New" } as never, owner);
    await controller.deleteVehicle("v1", owner);

    expect(update).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("reads another owner's vehicle as not found, for update and delete", async () => {
    const update = vi.fn();
    const remove = vi.fn();
    const controller = vehicles({
      listVehiclesUseCase: lister([{ id: "v1", ownerOperatorId: "someone-else" }]),
      updateVehicleUseCase: { execute: update },
      deleteVehicleUseCase: { execute: remove },
    });

    await expect(controller.updateVehicle("v1", { model: "X" } as never, owner)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.deleteVehicle("v1", owner)).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("does not limit an admin to owned vehicles", async () => {
    const update = vi.fn(async () => ({ id: "v1" }));
    const list = lister([{ id: "v1", ownerOperatorId: "someone-else" }]);
    const controller = vehicles({ listVehiclesUseCase: list, updateVehicleUseCase: { execute: update } });

    await controller.updateVehicle("v1", { model: "X" } as never, admin);

    expect(update).toHaveBeenCalledTimes(1);
    expect(list.execute).not.toHaveBeenCalled();
  });

  const csv = (registration: string) =>
    ({
      originalname: "v.csv",
      mimetype: "text/csv",
      size: 10,
      buffer: Buffer.from(`registration_number,model\n${registration},Actros\n`),
    }) as never;

  it("refuses an import that names a vehicle belonging to someone else, before writing anything", async () => {
    const importer = vi.fn();
    const controller = vehicles({
      listVehiclesUseCase: lister([{ id: "v1", registrationNumber: "LAG-1-AA", ownerOperatorId: "someone-else" }]),
      bulkImportVehiclesUseCase: { execute: importer },
    });

    await expect(controller.bulkImportVehicles(csv("lag-1-aa"), owner)).rejects.toBeInstanceOf(ConflictException);
    expect(importer).not.toHaveBeenCalled();
  });

  it("imports vehicles that are new or already theirs, stamped with their id", async () => {
    const importer = vi.fn(async () => ({ created: 1, updated: 0, total: 1, records: [] }));
    const controller = vehicles({
      listVehiclesUseCase: lister([{ id: "v1", registrationNumber: "LAG-1-AA", ownerOperatorId: "op-1" }]),
      bulkImportVehiclesUseCase: { execute: importer },
    });

    await controller.bulkImportVehicles(csv("LAG-2-BB"), owner);

    expect(importer).toHaveBeenCalledWith(expect.objectContaining({ ownerOperatorId: "op-1", tenantId: "t1" }));
  });

  it("creates imported vehicles as the importing owner's", async () => {
    const repo = new InMemoryVehicleRepository();
    const runtime = { getDefaultTenantId: () => "t1", generateId: () => "v-new" };
    const useCase = Reflect.construct(BulkImportVehiclesUseCase, [repo, runtime, { assertRoomFor: async () => {} }]) as BulkImportVehiclesUseCase;

    const result = await useCase.execute({ tenantId: "t1", ownerOperatorId: "op-1", items: [{ registrationNumber: "LAG-9-ZZ", model: "Van" }] });

    expect(result.records[0].ownerOperatorId).toBe("op-1");
  });
});

function fuelController(overrides: Record<string, unknown>) {
  return Object.assign(Object.create(FuelController.prototype), {
    recordActivity: vi.fn(async () => undefined),
    ...overrides,
  }) as FuelController;
}

describe("an owner operator's fuel writes", () => {
  it("cannot record fuel against another owner's vehicle", async () => {
    const record = vi.fn();
    const controller = fuelController({
      listVehiclesUseCase: lister([{ id: "v1", ownerOperatorId: "someone-else" }]),
      recordFuelUseCase: { execute: record },
    });

    await expect(controller.recordFuel({ vehicleId: "v1", liters: 10, pricePerLiter: 1 } as never, owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(record).not.toHaveBeenCalled();
  });

  it("records fuel against their own vehicle", async () => {
    const record = vi.fn(async () => ({ id: "f1", vehicleId: "v1", driverId: null, liters: 10, totalCost: 10, station: null }));
    const controller = fuelController({
      listVehiclesUseCase: lister([{ id: "v1", ownerOperatorId: "op-1" }]),
      recordFuelUseCase: { execute: record },
    });

    await controller.recordFuel({ vehicleId: "v1", liters: 10, pricePerLiter: 1 } as never, owner);

    expect(record).toHaveBeenCalledTimes(1);
  });

  it("treats a stranger's registration as unknown rather than confirming it exists", async () => {
    const controller = fuelController({
      listVehiclesUseCase: lister([{ id: "v1", registrationNumber: "LAG-1-AA", ownerOperatorId: "someone-else" }]),
      recordFuelUseCase: { execute: vi.fn() },
    });

    const error = await controller
      .recordFuel({ vehicleRegistration: "LAG-1-AA", liters: 10, pricePerLiter: 1 } as never, owner)
      .catch((e: unknown) => e);

    expect((error as { getResponse(): unknown }).getResponse()).toMatchObject({ field: "vehicleRegistration" });
  });
});

function seededFuel() {
  const repo = new InMemoryFuelRecordRepository();
  return repo;
}

const fuelRecord = (vehicleId: string) =>
  FuelRecord.create({
    id: "f1", tenantId: "t1", vehicleId, driverId: null, vehicleType: "truck", liters: 40, pricePerLiter: 100,
    station: "Total", odometer: 1, recordedAt: "2026-09-29T10:00:00.000Z", recordedBy: "u", deletedAt: null, auditTrail: [],
  });

describe("editing and deleting fuel records within an owner's vehicles", () => {
  const vehicleRepo = { findById: vi.fn(async () => ({ plateNumber: "A" })) };
  const driverRepo = { findById: vi.fn(async () => null) };

  async function update(scope: ReadonlySet<string> | null, patch: Record<string, unknown> = {}) {
    const repo = seededFuel();
    await repo.save(fuelRecord("v1"));
    const useCase = Reflect.construct(UpdateFuelRecordUseCase, [repo, vehicleRepo, driverRepo]) as UpdateFuelRecordUseCase;
    return useCase.execute({ id: "f1", tenantId: "t1", updatedBy: "u", station: "Shell", allowedVehicleIds: scope, ...patch });
  }

  it("edits a record on an owned vehicle", async () => {
    await expect(update(new Set(["v1"]))).resolves.toMatchObject({ station: "Shell" });
  });

  it("reads a record on another owner's vehicle as missing", async () => {
    await expect(update(new Set(["v2"]))).rejects.toBeInstanceOf(FuelRecordNotFoundError);
  });

  it("will not move a record onto a vehicle outside the owner's", async () => {
    await expect(update(new Set(["v1"]), { vehicleId: "v2" })).rejects.toThrow();
  });

  it("does not limit an admin", async () => {
    await expect(update(null)).resolves.toMatchObject({ station: "Shell" });
  });

  it("deletes only a record on an owned vehicle", async () => {
    const repo = seededFuel();
    await repo.save(fuelRecord("v1"));
    const useCase = Reflect.construct(DeleteFuelRecordUseCase, [repo]) as DeleteFuelRecordUseCase;

    await expect(useCase.execute("f1", "t1", "u", new Set(["v2"]))).rejects.toBeInstanceOf(FuelRecordNotFoundError);
    await expect(useCase.execute("f1", "t1", "u", new Set(["v1"]))).resolves.toBeUndefined();
  });
});

describe("an unknown capacity unit", () => {
  it("is left for the domain to refuse under its own field, not rejected by the DTO", async () => {
    const dto = plainToInstance(CreateVehicleDto, { model: "M", registrationNumber: "A", capacityUnit: "stones" });

    const errors = await validate(dto);

    expect(errors.filter((error) => error.property === "capacityUnit")).toEqual([]);
  });
});
