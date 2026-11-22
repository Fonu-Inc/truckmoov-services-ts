import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "./contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";
import type { AnalyticsRange } from "./contexts/fleet/reports/domain/analytics-range";
import { buildUtilizationRows, summarizeUtilization } from "./contexts/fleet/reports/domain/utilization";

type AllowedVehicleIds = ReadonlySet<string> | null | undefined;

@Injectable()
export class FleetUtilizationUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
  ) {}

  /** One vehicle read and one job read for the whole report; jobs are grouped per vehicle in memory. */
  async report(tenantId: string, range: AnalyticsRange, allowed?: AllowedVehicleIds) {
    const [vehicles, jobs] = await Promise.all([
      this.vehicleRepo.findAll({ tenantId }),
      this.dispatchJobs.listJobs(tenantId),
    ]);
    const visible = allowed ? vehicles.filter((vehicle) => allowed.has(vehicle.id)) : vehicles;
    const { rows, daily } = buildUtilizationRows(
      visible.map((vehicle) => ({
        id: vehicle.id,
        plateNumber: vehicle.plateNumber,
        make: vehicle.make,
        model: vehicle.model,
        status: vehicle.status,
        type: vehicle.type,
      })),
      jobs,
      range,
    );
    return {
      from: range.from,
      to: range.to,
      days: range.days,
      summary: summarizeUtilization(rows),
      vehicles: rows.sort((a, b) => b.utilizationPercent - a.utilizationPercent),
      daily,
    };
  }
}
