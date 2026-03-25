import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../drivers/domain/repositories/driver.repository";
import { JOB_REPOSITORY, type JobRepository } from "../../jobs/domain/repositories/job.repository";
import { ALERT_REPOSITORY, type AlertRepository } from "../../alerts/domain/alert.repository";
import { VehicleHealthService } from "../../../../vehicle-health.service";

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
    @Inject(JOB_REPOSITORY) private readonly jobRepo: JobRepository,
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: AlertRepository,
    private readonly healthService: VehicleHealthService,
  ) {}

  async execute(tenantId: string): Promise<OperationalDashboard> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const [vehicles, drivers, jobs, alerts] = await Promise.all([
      this.vehicleRepo.findAll({ tenantId }),
      this.driverRepo.findAll({ tenantId }),
      this.jobRepo.findAll({ tenantId }),
      this.alertRepo.findAll(tenantId),
    ]);

    const hourAgo = Date.now() - 3_600_000;
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
        seenInLastHour: vehicles.filter((v) => {
          const entry = this.healthService.get(v.id);
          return entry !== null && entry.lastSeen >= hourAgo;
        }).length,
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
