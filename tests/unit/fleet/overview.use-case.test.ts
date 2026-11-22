import { describe, expect, it, vi } from "vitest";
import { OverviewUseCase } from "../../../apps/fleet/src/contexts/fleet/reports/application/overview.use-case";
import { Vehicle } from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/entities/vehicle.entity";
import { Driver } from "../../../apps/fleet/src/contexts/fleet/drivers/domain/entities/driver.entity";
import type {
  DispatchActiveJobsMap,
  DispatchJob,
} from "../../../apps/fleet/src/contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";
import type { AuditEntry } from "../../../apps/fleet/src/audit-log.service";

const NOW = "2026-11-22T12:00:00.000Z";

function makeVehicle(
  id: string,
  values: {
    status?: string;
    assignedDriverId?: string | null;
    ownerOperatorId?: string | null;
    createdAt?: string;
  } = {},
) {
  return Vehicle.create({
    id,
    plateNumber: `LAG-${id}`,
    model: "Actros",
    make: "Mercedes-Benz",
    tenantId: "t1",
    status: (values.status ?? "active") as never,
    assignedDriverId: values.assignedDriverId ?? null,
    ownerOperatorId: values.ownerOperatorId ?? "op-1",
    gpsDevice: null,
    createdAt: values.createdAt ?? NOW,
  });
}

function makeDriver(id: string, assignedVehicleId: string | null = null, status = "active") {
  return Driver.create({
    id,
    name: `Driver ${id}`,
    phone: "+2348000000000",
    licenseNumber: `L-${id}`,
    tenantId: "t1",
    status: status as never,
    assignedVehicleId,
    contactChannels: { whatsappNumber: null, smsNumber: null, voiceNumber: null },
    updatedAt: NOW,
  });
}

function makeJob(values: Partial<DispatchJob> & { id: string }): DispatchJob {
  return {
    reference: `JOB-${values.id}`,
    status: "in_progress",
    assignedVehicleId: null,
    assignedDriverId: null,
    amountNgn: 0,
    createdAt: NOW,
    updatedAt: NOW,
    pickupAddress: "Apapa Port, Lagos",
    dropoffAddress: "Sango Industrial Estate, Ogun",
    deadline: null,
    punctuality: null,
    ...values,
  } as DispatchJob;
}

function makeAuditEntry(values: Partial<AuditEntry> & { id: string; entityType: AuditEntry["entityType"]; entityId: string; action: string }): AuditEntry {
  return {
    tenantId: "t1",
    actorId: "user-1",
    metadata: {},
    occurredAt: NOW,
    ...values,
  };
}

const EMPTY_MAP: DispatchActiveJobsMap = {
  jobs: [],
  counts: { activeDeliveries: 0, stops: 0, pickups: 0, dropoffs: 0 },
};

function buildUseCase(data: {
  vehicles?: Vehicle[];
  drivers?: Driver[];
  jobs?: DispatchJob[];
  activeJobsMap?: DispatchActiveJobsMap;
  audit?: AuditEntry[];
}) {
  const vehicleRepo = { findAll: vi.fn().mockResolvedValue(data.vehicles ?? []) };
  const driverRepo = { findAll: vi.fn().mockResolvedValue(data.drivers ?? []) };
  const dispatchJobs = {
    listJobs: vi.fn().mockResolvedValue(data.jobs ?? []),
    listActiveJobsMap: vi.fn().mockResolvedValue(data.activeJobsMap ?? EMPTY_MAP),
  };
  const alertRepo = { findAll: vi.fn().mockResolvedValue([]) };
  const positions = { listLatestPositions: vi.fn().mockResolvedValue([]) };
  const chats = { listRecentChats: vi.fn().mockResolvedValue([]) };
  const auditLog = { query: vi.fn().mockResolvedValue(data.audit ?? []) };
  const config = {
    overview: {
      alertThresholdHours: 24,
      positionFreshnessMinutes: 60,
      cacheTtlSeconds: 30,
    },
  };

  return new OverviewUseCase(
    vehicleRepo as never,
    driverRepo as never,
    dispatchJobs as never,
    alertRepo as never,
    positions as never,
    chats as never,
    auditLog as never,
    config as never,
  );
}

const ownerOperator = { tenantId: "t1", ownerOperatorId: "op-1" };

describe("OverviewUseCase operational vehicles", () => {
  it("returns active vehicles with their driver and active-job route", async () => {
    const useCase = buildUseCase({
      vehicles: [
        makeVehicle("348", { assignedDriverId: "d1" }),
        makeVehicle("902", { status: "maintenance" }),
      ],
      drivers: [makeDriver("d1", "348")],
      jobs: [makeJob({ id: "j1", assignedVehicleId: "348", assignedDriverId: "d1" })],
      activeJobsMap: {
        jobs: [{
          jobId: "j1",
          reference: "JOB-j1",
          status: "in_progress",
          assignedDriverId: "d1",
          assignedVehicleId: "348",
          waypoints: [
            { sequence: 1, type: "pickup", address: "Apapa Port, Lagos", latitude: null, longitude: null },
            { sequence: 2, type: "dropoff", address: "Sango Industrial Estate, Ogun", latitude: null, longitude: null },
          ],
          routeShape: null,
          routeEncoding: null,
        }],
        counts: { activeDeliveries: 1, stops: 2, pickups: 1, dropoffs: 1 },
      },
    });

    const result = await useCase.execute(ownerOperator);

    expect(result.vehiclesInOperation.total).toBe(1);
    expect(result.vehiclesInOperation.items[0]).toMatchObject({
      vehicleId: "348",
      driverName: "Driver d1",
      jobReference: "JOB-j1",
      pickupAddress: "Apapa Port, Lagos",
      dropoffAddress: "Sango Industrial Estate, Ogun",
      status: "active",
    });
  });

  it("returns the eight most recent jobs for the enterprise account", async () => {
    const useCase = buildUseCase({
      jobs: Array.from({ length: 9 }, (_, i) => makeJob({
        id: `j${i}`,
        createdAt: new Date(Date.UTC(2026, 10, 1 + i)).toISOString(),
      })),
    });

    const result = await useCase.execute({ tenantId: "t1", ownerOperatorId: null });

    expect(result.jobs.total).toBe(9);
    expect(result.jobs.items).toHaveLength(8);
    expect(result.jobs.items[0].id).toBe("j8");
  });

  it("falls back to the jobs list for an in-progress job missing from the map", async () => {
    const useCase = buildUseCase({
      vehicles: [makeVehicle("771")],
      drivers: [makeDriver("d1", "771")],
      jobs: [makeJob({ id: "j2", assignedVehicleId: "771", assignedDriverId: "d1" })],
    });

    const result = await useCase.execute(ownerOperator);

    expect(result.vehiclesInOperation.items[0]).toMatchObject({
      driverName: "Driver d1",
      jobReference: "JOB-j2",
      pickupAddress: "Apapa Port, Lagos",
    });
  });
});

describe("OverviewUseCase recent activity", () => {
  it("maps an audit job status event to a readable title and route", async () => {
    const useCase = buildUseCase({
      vehicles: [makeVehicle("348")],
      jobs: [makeJob({ id: "j1", status: "in_progress", assignedVehicleId: "348" })],
      audit: [makeAuditEntry({
        id: "a1",
        entityType: "job",
        entityId: "j1",
        action: "status.changed.in_progress",
        metadata: { newStatus: "in_progress" },
      })],
    });

    const result = await useCase.execute(ownerOperator);

    expect(result.recentActivity[0]).toMatchObject({
      title: "Job in progress",
      description: "Apapa Port → Sango Industrial Estate",
      occurredAt: NOW,
    });
  });

  it("hides another operator's events and fills the feed from owned records", async () => {
    const useCase = buildUseCase({
      vehicles: [makeVehicle("348")],
      drivers: [makeDriver("d1", "348")],
      jobs: [makeJob({ id: "j1", assignedVehicleId: "348" })],
      audit: [
        makeAuditEntry({
          id: "foreign",
          entityType: "job",
          entityId: "other-job",
          action: "status.changed.completed",
        }),
        makeAuditEntry({
          id: "owned",
          entityType: "vehicle",
          entityId: "348",
          action: "vehicle.status.updated",
          metadata: { status: "active" },
        }),
      ],
    });

    const result = await useCase.execute(ownerOperator);
    const ids = result.recentActivity.map((item) => item.entityId);

    expect(ids).not.toContain("other-job");
    expect(ids).toContain("348");
    expect(result.recentActivity.find((item) => item.entityId === "348")?.title)
      .toBe("LAG-348 is active");
  });

  it("builds a feed from current records when the audit log is empty", async () => {
    const useCase = buildUseCase({
      vehicles: [makeVehicle("348")],
      drivers: [makeDriver("d1", "348")],
      jobs: [makeJob({ id: "j1", assignedVehicleId: "348" })],
    });

    const result = await useCase.execute(ownerOperator);
    
    expect(result.recentActivity.map((item) => item.title)).toEqual([
      "Job in progress",
      "LAG-348 is active",
      "Driver d1 is active",
    ]);
    expect(result.recentActivity[0].description).toBe("Apapa Port → Sango Industrial Estate");
  });
});
