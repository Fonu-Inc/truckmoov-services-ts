import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { Role } from "@shared/rbac";
import { FuelController } from "../../../apps/fleet/src/fuel.controller";
import { VehiclesController } from "../../../apps/fleet/src/vehicles.controller";
import { FuelBudgetUseCase } from "../../../apps/fleet/src/contexts/fleet/fuel/application/fuel-budget.use-case";

const owner = { user: { tenantId: "t1", userId: "op-1", role: Role.OWNER_OPERATOR } } as never;
const admin = { user: { tenantId: "t1", userId: "adm", role: Role.ENTERPRISE_ADMIN } } as never;

const lister = (rows: Array<Record<string, unknown>>) => ({
  execute: vi.fn(async (query: { ownerOperatorId?: string }) =>
    query.ownerOperatorId ? rows.filter((row) => row["ownerOperatorId"] === query.ownerOperatorId) : rows,
  ),
});

// Two vehicles on one account: v1 belongs to the owner operator, v2 to someone else.
const fleet = lister([
  { id: "v1", ownerOperatorId: "op-1" },
  { id: "v2", ownerOperatorId: "someone-else" },
]);

const record = (vehicleId: string, liters: number, totalCost: number) => ({
  id: `f-${vehicleId}`, vehicleId, liters, totalCost, fuelType: "diesel", station: "Total",
  vehiclePlateNumber: vehicleId.toUpperCase(), driverName: null, recordedAt: "2026-09-29T10:00:00.000Z",
  pricePerLiter: totalCost / liters, auditTrail: [],
});

const allFuel = [record("v1", 10, 1000), record("v2", 40, 4000)];

function fuelController(extra: Record<string, unknown> = {}) {
  return Object.assign(Object.create(FuelController.prototype), {
    listVehiclesUseCase: fleet,
    listFuelRecordsUseCase: { execute: vi.fn(async () => allFuel) },
    ...extra,
  }) as FuelController;
}

describe("an owner operator's fuel reads", () => {
  it("lists only their own vehicles' transactions", async () => {
    const result = await fuelController().listFuelTransactions({} as never, owner);

    const rows = (result as unknown as { data: Array<{ vehicleId: string }> }).data;
    expect(rows.map((row) => row.vehicleId)).toEqual(["v1"]);
  });

  it("shows an admin the whole account", async () => {
    const result = await fuelController().listFuelTransactions({} as never, admin);

    const rows = (result as unknown as { data: Array<{ vehicleId: string }> }).data;
    expect(rows.map((row) => row.vehicleId)).toEqual(["v1", "v2"]);
  });

  it("exports only their own vehicles' rows", async () => {
    let body = "";
    const res = { setHeader: vi.fn(), send: (text: string) => (body = text) };

    await fuelController().exportFuel({} as never, owner, res);

    expect(body).toContain("v1");
    expect(body).not.toContain("v2");
  });

  it("totals the summary over their own vehicles only", async () => {
    const summary = (await fuelController().getFuelSummary(owner)) as { data: { totalLitres: number; transactionCount: number } };

    expect(summary.data).toMatchObject({ totalLitres: 10, transactionCount: 1 });
  });

  it("totals the summary over everything for an admin", async () => {
    const summary = (await fuelController().getFuelSummary(admin)) as { data: { totalLitres: number; transactionCount: number } };

    expect(summary.data).toMatchObject({ totalLitres: 50, transactionCount: 2 });
  });

  it("builds the weekly series from their own vehicles only", async () => {
    const series = (await fuelController().weeklyFuelConsumption("", "", owner)) as {
      data: { days: Array<{ totalLitres: number }> };
    };

    const litres = series.data.days.reduce((sum, day) => sum + day.totalLitres, 0);
    expect(litres).toBe(10);
  });

  it("passes their own vehicle ids to the budget reads, and none for an admin", async () => {
    const list = vi.fn(async () => []);
    const budgetVsActual = vi.fn(async () => ({ vehicles: [], fleet: null }));
    const controller = fuelController({ fuelBudgetUseCase: { list, budgetVsActual } });

    await controller.listFuelBudgets(owner);
    await controller.fuelBudgetVsActual({} as never, owner);
    await controller.listFuelBudgets(admin);

    expect([...(list.mock.calls[0][1] as Set<string>)]).toEqual(["v1"]);
    expect([...(budgetVsActual.mock.calls[0][2] as Set<string>)]).toEqual(["v1"]);
    expect(list.mock.calls[1][1]).toBeNull();
  });

  it("refuses a budget for another owner's vehicle or the fleet-wide one", async () => {
    const upsert = vi.fn(async () => ({}));
    const controller = fuelController({ fuelBudgetUseCase: { upsert } });
    const body = { periodType: "monthly", amountNgn: 1000 } as never;

    await expect(controller.upsertFuelBudget("v2", body, owner)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.upsertFuelBudget("all", body, owner)).rejects.toBeInstanceOf(NotFoundException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("lets them set a budget on their own vehicle, and an admin the fleet-wide one", async () => {
    const upsert = vi.fn(async () => ({}));
    const controller = fuelController({ fuelBudgetUseCase: { upsert } });
    const body = { periodType: "monthly", amountNgn: 1000 } as never;

    await controller.upsertFuelBudget("v1", body, owner);
    await controller.upsertFuelBudget("all", body, admin);

    expect(upsert).toHaveBeenCalledTimes(2);
  });
});

describe("fuel budget scoping in the use case", () => {
  const budgetRow = (vehicleId: string, amountNgn: number) => ({ id: `b-${vehicleId}`, tenantId: "t1", vehicleId, periodType: "monthly", amountNgn });

  function useCase() {
    const budgets = [budgetRow("v1", 3000), budgetRow("v2", 6000), budgetRow("", 9000)];
    const fuelRepo = {
      findAll: vi.fn(async () => allFuel.map((r) => ({ toPrimitives: () => r }))),
    };
    return Object.assign(Object.create(FuelBudgetUseCase.prototype), {
      em: async () => ({ find: async () => budgets }),
      fuelRepo,
    }) as FuelBudgetUseCase;
  }

  it("lists only budgets on the allowed vehicles and hides the fleet-wide one", async () => {
    const views = await useCase().list("t1", new Set(["v1"]));

    expect(views.map((view) => view.vehicleId)).toEqual(["v1"]);
  });

  it("lists everything when there is no limit", async () => {
    const views = await useCase().list("t1", null);

    expect(views).toHaveLength(3);
  });

  it("compares budget to actual over the allowed vehicles only, with no fleet row", async () => {
    const result = await useCase().budgetVsActual("t1", {}, new Set(["v1"]));

    expect(result.vehicles.map((row) => row.vehicleId)).toEqual(["v1"]);
    expect(result.fleet).toBeNull();
    expect(result.vehicles[0].actualNgn).toBe(1000);
  });

  it("counts every vehicle's spend against the fleet budget when unlimited", async () => {
    const result = await useCase().budgetVsActual("t1", {}, null);

    expect(result.fleet?.actualNgn).toBe(5000);
  });
});

describe("an owner operator's vehicle reads", () => {
  function vehicles(extra: Record<string, unknown>) {
    return Object.assign(Object.create(VehiclesController.prototype), { listVehiclesUseCase: fleet, ...extra }) as VehiclesController;
  }

  const detail = {
    getVehicleUseCase: { execute: vi.fn(async () => ({ id: "v1" })) },
    listDevicesUseCase: { execute: vi.fn(async () => []) },
    maintenanceRecordsUseCase: { list: vi.fn(async () => []) },
    listVehicleTripsUseCase: { execute: vi.fn(async () => []) },
  };

  it("reads another owner's vehicle as not found", async () => {
    await expect(vehicles(detail).getVehicle("v2", owner)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns their own vehicle", async () => {
    await expect(vehicles(detail).getVehicle("v1", owner)).resolves.toMatchObject({ id: "v1" });
  });

  it("returns any vehicle to an admin", async () => {
    await expect(vehicles(detail).getVehicle("v2", admin)).resolves.toMatchObject({ id: "v1" });
  });

  it("limits the fuel tab to their own vehicles", async () => {
    const controller = vehicles({ listFuelRecordsUseCase: { execute: vi.fn(async () => allFuel) } });
    const build = (controller as unknown as {
      buildTabPayload(tab: string, tenantId: string, query: object, owned: ReadonlySet<string> | null): Promise<{
        items: Array<{ vehicleId: string }>;
        summary: { transactionCount: number };
      }>;
    }).buildTabPayload.bind(controller);

    const limited = await build("fuel", "t1", {}, new Set(["v1"]));
    const everything = await build("fuel", "t1", {}, null);

    expect(limited.items.map((row) => row.vehicleId)).toEqual(["v1"]);
    expect(limited.summary.transactionCount).toBe(1);
    expect(everything.items).toHaveLength(2);
  });
});
