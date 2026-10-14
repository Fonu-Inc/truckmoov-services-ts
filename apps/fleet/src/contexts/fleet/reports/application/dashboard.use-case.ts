import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../drivers/domain/repositories/driver.repository";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import { ALERT_REPOSITORY, type AlertRepository } from "../../alerts/domain/alert.repository";
import {
  VEHICLE_POSITION_REPOSITORY,
  type VehiclePositionRepository,
} from "../../tracking/domain/vehicle-position.repository";

export type OperationalDashboard = {
  vehicles: { total: number; active: number; inactive: number; assigned: number; seenInLastHour: number };
  drivers: { total: number; active: number; inactive: number; assigned: number };
  jobs: { total: number; byStatus: Record<string, number> };
  alerts: { open: number; escalated: number };
  generatedAt: string;
};

const CACHE_TTL_MS = 30_000;

@Injectable()
export class DashboardUseCase {
  private cache = new Map<string, { value: OperationalDashboard; expiresAt: number }>();

  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly driverRepo: DriverRepository,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: AlertRepository,
    @Inject(VEHICLE_POSITION_REPOSITORY) private readonly positions: VehiclePositionRepository,
  ) {}

  async execute(tenantId: string): Promise<OperationalDashboard> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const [vehicles, drivers, jobs, alerts] = await Promise.all([
      this.vehicleRepo.findAll({ tenantId }),
      this.driverRepo.findAll({ tenantId }),
      this.dispatchJobs.listJobs(tenantId),
      this.alertRepo.findAll(tenantId),
    ]);

    const hourAgo = Date.now() - 3_600_000;
    const positions = await this.positions.findByVehicleIds(tenantId, vehicles.map((v) => v.id));
    const jobsByStatus: Record<string, number> = {};
    for (const j of jobs) {
      jobsByStatus[j.status] = (jobsByStatus[j.status] ?? 0) + 1;
    }

    const result: OperationalDashboard = {
      vehicles: {
        total: vehicles.length,
        active: vehicles.filter((v) => v.status === "active").length,
        inactive: vehicles.filter((v) => v.status === "inactive").length,
        assigned: vehicles.filter((v) => v.assignedDriverId !== null).length,
        seenInLastHour: vehicles.filter((v) => (positions.get(v.id)?.lastSeen ?? 0) >= hourAgo).length,
      },
      drivers: {
        total: drivers.length,
        active: drivers.filter((d) => d.status === "active" || d.status === "available").length,
        inactive: drivers.filter((d) => d.status === "offline" || d.status === "suspended").length,
        assigned: drivers.filter((d) => d.assignedVehicleId !== null).length,
      },
      jobs: { total: jobs.length, byStatus: jobsByStatus },
      alerts: {
        open: alerts.filter((a) => a.status === "open").length,
        escalated: alerts.filter((a) => a.status === "escalated").length,
      },
      generatedAt: new Date().toISOString(),
    };

    this.cache.set(tenantId, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }
}
