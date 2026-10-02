import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "./contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "./contexts/fleet/fuel/domain/repositories/fuel-record.repository";
import type { AnalyticsRange } from "./contexts/fleet/reports/domain/analytics-range";
import { buildFuelRows, summarizeFuel } from "./contexts/fleet/reports/domain/fuel-report";

type AllowedVehicleIds = ReadonlySet<string> | null | undefined;

@Injectable()
export class FleetFuelReportUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(FUEL_RECORD_REPOSITORY) private readonly fuelRepo: FuelRecordRepository,
  ) {}

  /** Recorded fuel for the window, grouped per vehicle in memory after one read of each source. */
  async report(tenantId: string, range: AnalyticsRange, allowed?: AllowedVehicleIds) {
    const [vehicles, records, jobs] = await Promise.all([
      this.vehicleRepo.findAll({ tenantId }),
      this.fuelRepo.findAll({ tenantId, from: range.from, to: range.to }).then((found) => found.map((record) => record.toPrimitives())),
      this.dispatchJobs.listJobs(tenantId),
    ]);
    const visible = allowed ? vehicles.filter((vehicle) => allowed.has(vehicle.id)) : vehicles;
    const { rows, litresForDistance } = buildFuelRows(
      visible.map((vehicle) => ({
        id: vehicle.id,
        plateNumber: vehicle.plateNumber,
        make: vehicle.make,
        model: vehicle.model,
        type: vehicle.type,
        fuelType: vehicle.fuelType ?? null,
      })),
      records,
      jobs,
      range,
    );
    return {
      from: range.from,
      to: range.to,
      summary: summarizeFuel(rows, litresForDistance),
      vehicles: rows.sort((a, b) => b.costNgn - a.costNgn),
    };
  }
}
