import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { FuelRecord } from "../../../apps/fleet/src/contexts/fleet/fuel/domain/entities/fuel-record.entity";
import { InMemoryFuelRecordRepository } from "../../../apps/fleet/src/contexts/fleet/fuel/infrastructure/in-memory-fuel-record.repository";
import { UpdateFuelRecordUseCase } from "../../../apps/fleet/src/contexts/fleet/fuel/application/update-fuel-record.use-case";
import { FuelController } from "../../../apps/fleet/src/fuel.controller";

const req = { user: { tenantId: "t1", userId: "u1", role: "OWNER_OPERATOR" } } as never;

function seedRecord() {
  return FuelRecord.create({
    id: "f1", tenantId: "t1", vehicleId: "v1", driverId: "d1", vehicleType: "truck",
    liters: 40, pricePerLiter: 1000, station: "Total", odometer: 5000,
    recordedAt: "2026-09-24T10:00:00.000Z", recordedBy: "u1", deletedAt: null, auditTrail: [],
  });
}

function useCaseWith(vehicles: Record<string, { plateNumber: string }>) {
  const repo = new InMemoryFuelRecordRepository();
  const vehicleRepo = { findById: vi.fn(async (id: string) => vehicles[id] ?? null) };
  const driverRepo = { findById: vi.fn(async () => ({ name: "Ada" })) };
  const useCase = Reflect.construct(UpdateFuelRecordUseCase, [repo, vehicleRepo, driverRepo]) as UpdateFuelRecordUseCase;
  return { repo, useCase };
}

describe("editing a fuel record", () => {
  it("moves the record to another vehicle and driver", async () => {
    const { repo, useCase } = useCaseWith({ v1: { plateNumber: "A-1" }, v2: { plateNumber: "B-2" } });
    await repo.save(seedRecord());

    const result = await useCase.execute({
      id: "f1", tenantId: "t1", updatedBy: "u1", vehicleId: "v2", driverId: "d2",
    });

    expect(result.vehicleId).toBe("v2");
    expect(result.vehiclePlateNumber).toBe("B-2");
    expect(result.driverId).toBe("d2");
  });

  it("leaves the vehicle and driver alone when the edit does not name them", async () => {
    const { repo, useCase } = useCaseWith({ v1: { plateNumber: "A-1" } });
    await repo.save(seedRecord());

    const result = await useCase.execute({ id: "f1", tenantId: "t1", updatedBy: "u1", station: "Shell" });

    expect(result.vehicleId).toBe("v1");
    expect(result.driverId).toBe("d1");
    expect(result.station).toBe("Shell");
  });

  it("refuses a vehicle that is not this tenant's", async () => {
    const { repo, useCase } = useCaseWith({ v1: { plateNumber: "A-1" } });
    await repo.save(seedRecord());

    await expect(
      useCase.execute({ id: "f1", tenantId: "t1", updatedBy: "u1", vehicleId: "elsewhere" }),
    ).rejects.toThrow();
  });
});

describe("resolving the vehicle and driver on PATCH", () => {
  function controllerWith(vehicles: unknown[], drivers: unknown[], update = vi.fn(async () => ({ vehicleId: "v2" }))) {
    const none = {};
    const controller = Reflect.construct(FuelController, [
      none, none, none, none,
      { execute: update },
      none, none, none, none,
      { execute: vi.fn(async () => vehicles) },
      { execute: vi.fn(async () => drivers) },
    ]) as FuelController;
    (controller as unknown as { recordActivity: () => Promise<void> }).recordActivity = async () => undefined;
    return { controller, update };
  }

  it("resolves a registration and driver name the same way POST does", async () => {
    const { controller, update } = controllerWith(
      [{ id: "v2", registrationNumber: "PRB-904-ZZ" }],
      [{ id: "d9", name: "John Doe" }],
    );

    await controller.updateFuel("f1", { vehicleRegistration: "prb-904-zz", driverName: "john doe" } as never, req);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ vehicleId: "v2", driverId: "d9" }));
  });

  it("rejects an unknown registration with the field named", async () => {
    const { controller } = controllerWith([], []);

    const error = await controller
      .updateFuel("f1", { vehicleRegistration: "NOPE-000-XX" } as never, req)
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ field: "vehicleRegistration" });
  });

  it("stores no driver for a name that matches nobody", async () => {
    const { controller, update } = controllerWith([], []);

    await controller.updateFuel("f1", { driverName: "Nobody" } as never, req);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ driverId: null }));
  });

  it("lets an explicit vehicleId win over a registration", async () => {
    const { controller, update } = controllerWith([{ id: "v2", registrationNumber: "PRB-904-ZZ" }], []);

    await controller.updateFuel("f1", { vehicleId: "v7", vehicleRegistration: "PRB-904-ZZ" } as never, req);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ vehicleId: "v7" }));
  });
});
