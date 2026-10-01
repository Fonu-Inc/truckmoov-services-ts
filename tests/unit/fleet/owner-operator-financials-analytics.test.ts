import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { OWNER_OPERATOR_ORGANISATION_TYPE, Role } from "@shared/rbac";
import { AnalyticsController } from "../../../apps/fleet/src/analytics.controller";
import { FinancialsController } from "../../../apps/fleet/src/financials.controller";
import { FleetAnalyticsUseCase } from "../../../apps/fleet/src/fleet-analytics.use-case";
import { FleetFinancialsUseCase } from "../../../apps/fleet/src/fleet-financials.use-case";

const as = (userId: string, role: string, organizationType: string | null = "enterprise") =>
  ({ user: { tenantId: "t1", userId, role, organizationType } }) as never;

const opOne = as("op-1", Role.OWNER_OPERATOR);
const opTwo = as("op-2", Role.OWNER_OPERATOR);
const admin = as("adm", Role.ENTERPRISE_ADMIN);
const founder = as("op-1", Role.OWNER_OPERATOR, OWNER_OPERATOR_ORGANISATION_TYPE);

// One account, two independent operators: v1 is op-1's, v2 is op-2's.
const vehicles = [
  { id: "v1", ownerOperatorId: "op-1", plateNumber: "PLATE-ONE", make: "Volvo", model: "FH", status: "active", type: "truck", assignedDriverId: "d1" },
  { id: "v2", ownerOperatorId: "op-2", plateNumber: "PLATE-TWO", make: "MAN", model: "TGX", status: "maintenance", type: "truck", assignedDriverId: "d2" },
];

const lister = {
  execute: vi.fn(async (query: { ownerOperatorId?: string }) =>
    query.ownerOperatorId ? vehicles.filter((v) => v.ownerOperatorId === query.ownerOperatorId) : vehicles,
  ),
};

const now = new Date().toISOString();
const jobs = [
  { id: "j1", status: "delivered", assignedVehicleId: "v1", amountNgn: 100_000, updatedAt: now },
  { id: "j2", status: "delivered", assignedVehicleId: "v2", amountNgn: 700_000, updatedAt: now },
  { id: "j3", status: "created", assignedVehicleId: null, amountNgn: 50_000, updatedAt: now },
];

describe("an owner operator's financials", () => {
  const fuel = [
    { vehicleId: "v1", liters: 10, pricePerLiter: 1000, odometer: null, recordedAt: now },
    { vehicleId: "v2", liters: 40, pricePerLiter: 1000, odometer: null, recordedAt: now },
  ];
  const configs = [
    { vehicleId: "v1", monthlyInsuranceNgn: 5000 },
    { vehicleId: "v2", monthlyInsuranceNgn: 9000 },
  ];

  function financials() {
    const useCase = new FleetFinancialsUseCase(
      { findAll: async () => vehicles } as never,
      { listJobs: async () => jobs } as never,
      { findAll: async () => fuel.map((f) => ({ toPrimitives: () => f })) } as never,
      { findAllByTenant: async () => [] } as never,
      {} as never,
    );
    vi.spyOn(useCase as unknown as { getConfigs: () => Promise<unknown[]> }, "getConfigs").mockResolvedValue(configs);
    vi.spyOn(useCase, "getConfig").mockResolvedValue(null);
    vi.spyOn(useCase, "upsertConfig").mockResolvedValue({} as never);
    const controller = Object.assign(Object.create(FinancialsController.prototype), {
      fleetFinancialsUseCase: useCase,
      listVehiclesUseCase: lister,
    }) as FinancialsController;
    return { controller, useCase };
  }

  const summaryFor = async (req: never) =>
    (await financials().controller.getFinancialSummary({} as never, req)).data;

  it("totals the summary over each operator's own vehicle only", async () => {
    expect(await summaryFor(opOne)).toMatchObject({ vehicleCount: 1, totalRevenue: 100_000, costBreakdown: { fuel: 10_000 } });
    expect(await summaryFor(opTwo)).toMatchObject({ vehicleCount: 1, totalRevenue: 700_000, costBreakdown: { fuel: 40_000 } });
  });

  it("totals the summary over the whole account for an admin and the owner-operator org's founder", async () => {
    expect(await summaryFor(admin)).toMatchObject({ vehicleCount: 2, totalRevenue: 800_000 });
    expect(await summaryFor(founder)).toMatchObject({ vehicleCount: 2 });
  });

  it("lists profitability rows for their own vehicle only", async () => {
    const { controller } = financials();

    const own = await controller.computeProfitability({} as never, opOne);
    const all = await controller.computeProfitability({} as never, admin);

    expect(own.data.map((row) => row.vehicleId)).toEqual(["v1"]);
    expect(all.data.map((row) => row.vehicleId)).toEqual(["v1", "v2"]);
  });

  it("builds the statement from their own vehicle only", async () => {
    const statement = await financials().controller.getFinancialStatement({} as never, opTwo);
    const data = statement.data as unknown as { summary: { vehicleCount: number }; vehicles: Array<{ vehicleId: string }> };

    expect(data.vehicles.map((v) => v.vehicleId)).toEqual(["v2"]);
    expect(data.summary.vehicleCount).toBe(1);
  });

  it("lists only their own vehicles' cost configs", async () => {
    const own = await financials().controller.listFinancialConfigs(opOne);
    const all = await financials().controller.listFinancialConfigs(admin);

    expect(own.data.map((c) => c.vehicleId)).toEqual(["v1"]);
    expect(all.data).toHaveLength(2);
  });

  it("reads and writes another operator's vehicle config as not found", async () => {
    const { controller, useCase } = financials();
    const body = { monthlyInsuranceNgn: 1 } as never;

    await expect(controller.getFinancialConfig("v2", opOne)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.upsertFinancialConfig("v2", body, opOne)).rejects.toThrow("Vehicle not found");
    expect(useCase.getConfig).not.toHaveBeenCalled();
    expect(useCase.upsertConfig).not.toHaveBeenCalled();
  });

  it("lets them configure their own vehicle, and an admin any vehicle", async () => {
    const { controller, useCase } = financials();
    const body = { monthlyInsuranceNgn: 1 } as never;

    await controller.upsertFinancialConfig("v1", body, opOne);
    await controller.upsertFinancialConfig("v2", body, admin);
    await controller.getFinancialConfig("v2", admin);

    expect(useCase.upsertConfig).toHaveBeenCalledTimes(2);
    expect(useCase.getConfig).toHaveBeenCalledTimes(1);
  });

  async function exported(
    route: "exportVehiclePL" | "exportCostBreakdown" | "exportFinancialStatement",
    req: never,
  ): Promise<string> {
    let body = "";
    const res = { setHeader: vi.fn(), send: (text: string) => (body = String(text)) };
    const controller = financials().controller;
    if (route === "exportFinancialStatement") await controller.exportFinancialStatement({ format: "csv" } as never, req, res);
    else await controller[route](req, res);
    return body;
  }

  it.each(["exportVehiclePL", "exportCostBreakdown", "exportFinancialStatement"] as const)(
    "%s carries only their own vehicle",
    async (route) => {
      const own = await exported(route, opOne);
      const all = await exported(route, admin);

      expect(own).toContain("PLATE-ONE");
      expect(own).not.toContain("PLATE-TWO");
      expect(all).toContain("PLATE-TWO");
    },
  );
});

describe("an owner operator's analytics", () => {
  const triggeredAt = new Date();
  const drivers = [
    { id: "d1", name: "Ade", status: "active", assignedVehicleId: "v1" },
    { id: "d2", name: "Bola", status: "active", assignedVehicleId: "v2" },
    { id: "d3", name: "Chi", status: "available", assignedVehicleId: null },
  ];
  const alerts = [
    { id: "a1", type: "harsh_braking", severity: "high", status: "open", vehicleId: "v1", jobId: null, details: {}, triggeredAt },
    { id: "a2", type: "overspeeding", severity: "critical", status: "open", vehicleId: "v2", jobId: null, details: {}, triggeredAt },
    { id: "a3", type: "geofence_exit", severity: "low", status: "open", vehicleId: null, jobId: null, details: {}, triggeredAt },
  ];

  function analytics() {
    const useCase = new FleetAnalyticsUseCase(
      { findAll: async () => vehicles } as never,
      { findAll: async () => drivers } as never,
      { listJobs: async () => jobs } as never,
      { findAll: async () => alerts } as never,
      {} as never,
    );
    return Object.assign(Object.create(AnalyticsController.prototype), {
      fleetAnalyticsUseCase: useCase,
      listVehiclesUseCase: lister,
    }) as AnalyticsController;
  }

  it("counts only their own vehicle, its driver, its jobs and its events in the summary", async () => {
    const one = (await analytics().getAnalyticsSummary("30", opOne)).data;
    const two = (await analytics().getAnalyticsSummary("30", opTwo)).data;

    expect(one).toMatchObject({ vehicles: { total: 1, active: 1 }, drivers: { total: 1 }, jobs: { total: 1, pending: 0 }, safety: { totalEvents: 1, critical: 0 } });
    expect(two).toMatchObject({ vehicles: { total: 1, maintenance: 1 }, drivers: { total: 1 }, jobs: { total: 1 }, safety: { critical: 1 } });
  });

  it("counts the whole account for an admin", async () => {
    const all = (await analytics().getAnalyticsSummary("30", admin)).data;

    expect(all).toMatchObject({ vehicles: { total: 2 }, drivers: { total: 3 }, jobs: { total: 3, pending: 1 }, safety: { totalEvents: 3 } });
  });

  it("limits fleet status and fuel levels to their own vehicle", async () => {
    const status = (await analytics().getFleetStatus("30", opOne)).data;
    const levels = (await analytics().getFuelLevels("30", opTwo)).data;

    expect(status.breakdown.map((v) => v.id)).toEqual(["v1"]);
    expect(levels.vehicles.map((v) => v.vehicleId)).toEqual(["v2"]);
  });

  it("keeps only jobs assigned to their own vehicle in the pipeline", async () => {
    const own = (await analytics().getJobPipeline("30", opOne)).data;
    const all = (await analytics().getJobPipeline("30", admin)).data;

    expect(own).toMatchObject({ total: 1, byStatus: { delivered: 1 } });
    expect(all).toMatchObject({ total: 3, byStatus: { delivered: 2, created: 1 } });
  });

  it("scores only the driver on their own vehicle", async () => {
    const one = (await analytics().getDriverScores("30", "20", opOne)).data;
    const two = (await analytics().getDriverScores("30", "20", opTwo)).data;

    expect(one.map((s) => s.driverId)).toEqual(["d1"]);
    expect(two.map((s) => s.driverId)).toEqual(["d2"]);
  });

  it("lists only events raised on their own vehicle", async () => {
    const own = (await analytics().getAnalyticsEvents("30", "50", undefined as never, opOne)).data;
    const all = (await analytics().getAnalyticsEvents("30", "50", undefined as never, admin)).data;

    expect(own.map((e) => e.id)).toEqual(["a1"]);
    expect(all).toHaveLength(3);
  });

  it("averages the safety radar over their own driver only", async () => {
    const one = (await analytics().getVehicleSafetyRadar("30", opOne)).data;
    const two = (await analytics().getVehicleSafetyRadar("30", opTwo)).data;

    expect(one).toMatchObject({ braking: 98, speedControl: 100 });
    expect(two).toMatchObject({ braking: 100, speedControl: 98 });
  });

  it("exports only their own vehicle", async () => {
    let body = "";
    const res = { setHeader: vi.fn(), send: (text: string) => (body = text) };

    await analytics().exportAnalytics("30", opOne, res);

    expect(body).toContain("PLATE-ONE");
    expect(body).not.toContain("PLATE-TWO");
    expect(body).not.toContain("Bola");
  });
});
