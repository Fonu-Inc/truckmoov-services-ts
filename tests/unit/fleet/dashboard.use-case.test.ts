import { describe, expect, it, vi, afterEach } from "vitest";
import { DashboardUseCase } from "../../../apps/fleet/src/contexts/fleet/reports/application/dashboard.use-case";
import { Vehicle } from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/entities/vehicle.entity";
import { Driver } from "../../../apps/fleet/src/contexts/fleet/drivers/domain/entities/driver.entity";
import type { DispatchJob } from "../../../apps/fleet/src/contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";
import { Alert } from "../../../apps/fleet/src/contexts/fleet/alerts/domain/alert.entity";
import { VehicleHealthService } from "../../../apps/fleet/src/vehicle-health.service";

function makeVehicle(id: string, status = "active", assignedDriverId: string | null = null) {
  return Vehicle.create({ id, plateNumber: `P-${id}`, model: "Truck", tenantId: "t1", status: status as any, assignedDriverId, gpsDevice: null });
}

function makeDriver(id: string, status = "active", assignedVehicleId: string | null = null) {
  return Driver.create({ id, name: `D ${id}`, licenseNumber: `L-${id}`, tenantId: "t1", status: status as any, assignedVehicleId, contactChannels: { whatsappNumber: null, smsNumber: null, voiceNumber: null } });
}

function makeJob(id: string, status: string): DispatchJob {
  const now = new Date().toISOString();
  return { id, reference: "", status, assignedVehicleId: null, assignedDriverId: null, amountNgn: 0, createdAt: now, updatedAt: now };
}

function makeAlert(id: string, status: string) {
  return Alert.create({ id, tenantId: "t1", type: "test", severity: "low", status: status as any, vehicleId: null, jobId: null, details: {}, triggeredAt: new Date(), acknowledgedAt: null, resolvedAt: null, escalatedAt: null, acknowledgedBy: null, resolvedBy: null });
}

function buildUseCase(data: { vehicles?: Vehicle[]; drivers?: Driver[]; jobs?: DispatchJob[]; alerts?: Alert[]; healthMap?: Map<string, number> }) {
  const vehicleRepo = { findAll: vi.fn().mockResolvedValue(data.vehicles ?? []) };
  const driverRepo = { findAll: vi.fn().mockResolvedValue(data.drivers ?? []) };
  const dispatchJobs = { listJobs: vi.fn().mockResolvedValue(data.jobs ?? []) };
  const alertRepo = { findAll: vi.fn().mockResolvedValue(data.alerts ?? []) };
  const healthSvc = new VehicleHealthService();
  data.healthMap?.forEach((ts, id) => healthSvc.touch(id, ts));
  return new DashboardUseCase(vehicleRepo as any, driverRepo as any, dispatchJobs as any, alertRepo as any, healthSvc);
}

describe("DashboardUseCase", () => {
  afterEach(() => vi.useRealTimers());

  it("returns correct vehicle counts", async () => {
    const uc = buildUseCase({ vehicles: [makeVehicle("v1"), makeVehicle("v2", "inactive"), makeVehicle("v3", "active", "d1")] });
    const d = await uc.execute("t1");
    expect(d.vehicles.total).toBe(3);
    expect(d.vehicles.active).toBe(2);
    expect(d.vehicles.inactive).toBe(1);
    expect(d.vehicles.assigned).toBe(1);
  });

  it("counts seenInLastHour correctly", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T10:00:00Z"));
    const uc = buildUseCase({
      vehicles: [makeVehicle("v1"), makeVehicle("v2")],
      healthMap: new Map([["v1", Date.now() - 10 * 60 * 1000], ["v2", Date.now() - 2 * 3600 * 1000]]),
    });
    expect((await uc.execute("t1")).vehicles.seenInLastHour).toBe(1);
  });

  it("returns jobs grouped by status", async () => {
    const uc = buildUseCase({ jobs: [makeJob("j1", "pending"), makeJob("j2", "pending"), makeJob("j3", "delivered")] });
    const d = await uc.execute("t1");
    expect(d.jobs.total).toBe(3);
    expect(d.jobs.byStatus["pending"]).toBe(2);
  });

  it("returns alert counts", async () => {
    const uc = buildUseCase({ alerts: [makeAlert("a1", "open"), makeAlert("a2", "escalated"), makeAlert("a3", "resolved")] });
    const d = await uc.execute("t1");
    expect(d.alerts.open).toBe(1);
    expect(d.alerts.escalated).toBe(1);
  });

  it("caches result for 30s", async () => {
    vi.useFakeTimers();
    const vehicleRepo = { findAll: vi.fn().mockResolvedValue([]) };
    const uc = new DashboardUseCase(vehicleRepo as any, { findAll: vi.fn().mockResolvedValue([]) } as any, { listJobs: vi.fn().mockResolvedValue([]) } as any, { findAll: vi.fn().mockResolvedValue([]) } as any, new VehicleHealthService());
    await uc.execute("t1");
    await uc.execute("t1");
    expect(vehicleRepo.findAll).toHaveBeenCalledOnce();
  });

  it("invalidates cache after 30s", async () => {
    vi.useFakeTimers();
    const vehicleRepo = { findAll: vi.fn().mockResolvedValue([]) };
    const uc = new DashboardUseCase(vehicleRepo as any, { findAll: vi.fn().mockResolvedValue([]) } as any, { listJobs: vi.fn().mockResolvedValue([]) } as any, { findAll: vi.fn().mockResolvedValue([]) } as any, new VehicleHealthService());
    await uc.execute("t1");
    vi.advanceTimersByTime(31_000);
    await uc.execute("t1");
    expect(vehicleRepo.findAll).toHaveBeenCalledTimes(2);
  });
});
