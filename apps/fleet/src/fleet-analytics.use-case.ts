import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { DRIVER_REPOSITORY, type DriverRepository } from "./contexts/fleet/drivers/domain/repositories/driver.repository";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "./contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";
import { ALERT_REPOSITORY, type AlertRepository } from "./contexts/fleet/alerts/domain/alert.repository";
import { VehicleHealthService } from "./vehicle-health.service";

function cutoff(periodDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - periodDays);
  return d;
}

@Injectable()
export class FleetAnalyticsUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly driverRepo: DriverRepository,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: AlertRepository,
    private readonly healthService: VehicleHealthService,
  ) {}

  async summary(tenantId: string, periodDays = 30) {
    const since = cutoff(periodDays);
    const [vehicles, drivers, jobs, alerts] = await Promise.all([
      this.vehicleRepo.findAll({ tenantId }),
      this.driverRepo.findAll({ tenantId }),
      this.dispatchJobs.listJobs(tenantId),
      this.alertRepo.findAll(tenantId),
    ]);
    const recentJobs = jobs.filter((j) => new Date(j.updatedAt) >= since);
    const recentAlerts = alerts.filter((a) => a.triggeredAt >= since);
    return {
      vehicles: {
        total: vehicles.length,
        active: vehicles.filter((v) => v.status === "active").length,
        inactive: vehicles.filter((v) => v.status === "inactive").length,
        maintenance: vehicles.filter((v) => v.status === "maintenance").length,
        decommissioned: vehicles.filter((v) => v.status === "decommissioned").length,
      },
      drivers: {
        total: drivers.length,
        active: drivers.filter((d) => d.status === "active" || d.status === "available").length,
        inactive: drivers.filter((d) => d.status === "offline" || d.status === "suspended").length,
      },
      jobs: {
        total: recentJobs.length,
        completed: recentJobs.filter((j) => j.status === "delivered").length,
        // Go dispatch lifecycle: created → assigned → en-route → arrived → loaded → delivered.
        inProgress: recentJobs.filter((j) => ["assigned", "en-route", "arrived", "loaded"].includes(j.status)).length,
        pending: recentJobs.filter((j) => j.status === "created").length,
      },
      safety: {
        totalEvents: recentAlerts.length,
        open: recentAlerts.filter((a) => a.status === "open").length,
        critical: recentAlerts.filter((a) => a.severity === "critical").length,
      },
      periodDays,
    };
  }

  async fleetStatus(tenantId: string, periodDays = 30) {
    const vehicles = await this.vehicleRepo.findAll({ tenantId });
    const byStatus: Record<string, number> = {};
    for (const v of vehicles) {
      byStatus[v.status] = (byStatus[v.status] ?? 0) + 1;
    }
    return {
      total: vehicles.length,
      byStatus,
      breakdown: vehicles.map((v) => ({
        id: v.id,
        plateNumber: v.plateNumber,
        status: v.status,
        type: v.type,
        assignedDriverId: v.assignedDriverId,
      })),
      periodDays,
    };
  }

  async jobPipeline(tenantId: string, periodDays = 30) {
    const since = cutoff(periodDays);
    const jobs = await this.dispatchJobs.listJobs(tenantId);
    const recent = jobs.filter((j) => new Date(j.updatedAt) >= since);
    const byStatus: Record<string, number> = {};
    for (const j of recent) {
      byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
    }
    return { total: recent.length, byStatus, periodDays };
  }

  async fuelLevels(tenantId: string, periodDays = 30) {
    const vehicles = await this.vehicleRepo.findAll({ tenantId });
    return {
      periodDays,
      vehicles: vehicles.map((v) => ({
        vehicleId: v.id,
        plateNumber: v.plateNumber,
        fuelLevelPercent: null as number | null,
        lastUpdated: null as string | null,
      })),
    };
  }

  async driverScores(tenantId: string, periodDays = 30, limit = 20) {
    const since = cutoff(periodDays);
    const [vehicles, drivers, alerts] = await Promise.all([
      this.vehicleRepo.findAll({ tenantId }),
      this.driverRepo.findAll({ tenantId }),
      this.alertRepo.findAll(tenantId),
    ]);
    const recentAlerts = alerts.filter((a) => a.triggeredAt >= since);
    const vehicleToDriver = new Map(
      vehicles.filter((v) => v.assignedDriverId).map((v) => [v.id, v.assignedDriverId!]),
    );
    const driverMap = new Map(drivers.map((d) => [d.id, d.name]));
    const scores = new Map<string, { driverId: string; driverName: string; incidents: number; harshBraking: number; overspeeding: number }>();
    for (const alert of recentAlerts) {
      if (!alert.vehicleId) continue;
      const driverId = vehicleToDriver.get(alert.vehicleId);
      if (!driverId) continue;
      const entry = scores.get(driverId) ?? {
        driverId,
        driverName: driverMap.get(driverId) ?? "Unknown",
        incidents: 0,
        harshBraking: 0,
        overspeeding: 0,
      };
      entry.incidents++;
      if (alert.type.includes("harsh_braking")) entry.harshBraking++;
      if (alert.type.includes("overspeeding") || alert.type.includes("speeding")) entry.overspeeding++;
      scores.set(driverId, entry);
    }
    return [...scores.values()]
      .sort((a, b) => b.incidents - a.incidents)
      .slice(0, limit)
      .map((s) => ({ ...s, safetyScore: Math.max(0, 100 - s.incidents * 2) }));
  }

  async vehicleSafetyRadar(tenantId: string, periodDays = 30) {
    const since = cutoff(periodDays);
    const [vehicles, drivers, alerts] = await Promise.all([
      this.vehicleRepo.findAll({ tenantId }),
      this.driverRepo.findAll({ tenantId }),
      this.alertRepo.findAll(tenantId),
    ]);
    const recentAlerts = alerts.filter((a) => a.triggeredAt >= since);
    const vehicleToDriver = new Map(
      vehicles.filter((v) => v.assignedDriverId).map((v) => [v.id, v.assignedDriverId!]),
    );
    const driverIds = new Set(drivers.map((d) => d.id));

    const counts = new Map<string, { braking: number; acceleration: number; speedControl: number; cornering: number }>();
    for (const driverId of driverIds) {
      counts.set(driverId, { braking: 0, acceleration: 0, speedControl: 0, cornering: 0 });
    }

    for (const alert of recentAlerts) {
      if (!alert.vehicleId) continue;
      const driverId = vehicleToDriver.get(alert.vehicleId);
      if (!driverId || !counts.has(driverId)) continue;
      const entry = counts.get(driverId)!;
      if (alert.type.includes("harsh_braking")) entry.braking++;
      if (alert.type.includes("harsh_acceleration")) entry.acceleration++;
      if (alert.type.includes("overspeeding") || alert.type.includes("speeding")) entry.speedControl++;
      if (alert.type.includes("harsh_cornering") || alert.type.includes("cornering")) entry.cornering++;
    }

    const entries = [...counts.values()];
    const total = entries.length || 1;
    const avg = (key: keyof (typeof entries)[0]) =>
      Math.round(entries.reduce((sum, e) => sum + Math.max(0, 100 - (e[key] as number) * 2), 0) / total);

    return {
      braking: avg("braking"),
      acceleration: avg("acceleration"),
      speedControl: avg("speedControl"),
      cornering: avg("cornering"),
      periodDays,
    };
  }

  async events(tenantId: string, periodDays = 30, limit = 50, severity?: string) {
    const since = cutoff(periodDays);
    const alerts = await this.alertRepo.findAll(tenantId, severity ? { type: severity } : undefined);
    return alerts
      .filter((a) => a.triggeredAt >= since && (!severity || a.severity === severity))
      .sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime())
      .slice(0, limit)
      .map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        status: a.status,
        vehicleId: a.vehicleId,
        jobId: a.jobId,
        details: a.details,
        triggeredAt: a.triggeredAt.toISOString(),
      }));
  }
}
