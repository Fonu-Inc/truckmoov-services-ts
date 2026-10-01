import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@shared/rbac";
import { FinancialsController } from "../../../apps/fleet/src/financials.controller";
import { FleetFinancialsUseCase } from "../../../apps/fleet/src/fleet-financials.use-case";
import { MikroVehicleRepository } from "../../../apps/fleet/src/contexts/fleet/vehicles/infrastructure/repositories/mikro-vehicle.repository";
import {
  FleetFinancialConfigRecord,
  VehicleRecord,
} from "../../../apps/fleet/src/contexts/fleet/shared/infrastructure/persistence/fleet-orm";

const em = vi.hoisted(() => {
  const fake = {
    findOne: vi.fn(),
    find: vi.fn(),
    upsert: vi.fn(),
    flush: vi.fn(),
    nativeDelete: vi.fn(),
    transactional: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(fake)),
  };
  return fake;
});

vi.mock("../../../apps/fleet/src/contexts/fleet/shared/infrastructure/persistence/fleet-orm", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFleetOrm: async () => ({ em: { fork: () => em } }),
}));

const admin = { user: { tenantId: "t1", userId: "adm", role: Role.ENTERPRISE_ADMIN } } as never;
const vehicles = [{ id: "v1", plateNumber: "ONE" }];

function controller() {
  const useCase = new FleetFinancialsUseCase(
    {
      findAll: async () => vehicles,
      findById: async (id: string) => vehicles.find((v) => v.id === id) ?? null,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    { db: {} } as never,
  );
  return Object.assign(Object.create(FinancialsController.prototype), {
    fleetFinancialsUseCase: useCase,
    listVehiclesUseCase: { execute: async () => vehicles },
  }) as FinancialsController;
}

beforeEach(() => {
  em.findOne.mockResolvedValue({ id: "c-gone", tenantId: "t1", vehicleId: "gone" });
  em.find.mockResolvedValue([
    { id: "c1", tenantId: "t1", vehicleId: "v1" },
    { id: "c-gone", tenantId: "t1", vehicleId: "gone" },
  ]);
});

describe("a financial config for a vehicle that does not exist", () => {
  it("reads as 404 Vehicle not found rather than returning the leftover row", async () => {
    const error = await controller().getFinancialConfig("gone", admin).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toContain("Vehicle not found");
  });

  it("refuses a write as 404 and stores nothing", async () => {
    const error = await controller()
      .upsertFinancialConfig("gone", { monthlyInsuranceNgn: 1 } as never, admin)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(em.upsert).not.toHaveBeenCalled();
  });

  it("is left out of the config list", async () => {
    const list = await controller().listFinancialConfigs(admin);

    expect(list.data.map((c) => c.vehicleId)).toEqual(["v1"]);
  });

  it("still reads and writes for a vehicle that exists", async () => {
    em.findOne.mockResolvedValue({ id: "c1", tenantId: "t1", vehicleId: "v1" });

    expect((await controller().getFinancialConfig("v1", admin)).data).toMatchObject({ vehicleId: "v1" });
    await controller().upsertFinancialConfig("v1", { monthlyInsuranceNgn: 1 } as never, admin);
    expect(em.upsert).toHaveBeenCalledOnce();
  });
});

describe("deleting a vehicle", () => {
  it("deletes its financial config with it, in one transaction", async () => {
    await new MikroVehicleRepository({ db: {} } as never).deleteById("v1", "t1");

    expect(em.transactional).toHaveBeenCalledOnce();
    expect(em.nativeDelete).toHaveBeenCalledWith(FleetFinancialConfigRecord, { vehicleId: "v1", tenantId: "t1" });
    expect(em.nativeDelete).toHaveBeenCalledWith(VehicleRecord, { id: "v1", tenantId: "t1" });
  });
});
