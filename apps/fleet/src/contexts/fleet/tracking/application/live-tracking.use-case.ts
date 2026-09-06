import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  DISPATCH_JOBS_READER,
  type DispatchJob,
  type DispatchJobsReader,
} from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import {
  VEHICLE_POSITIONS_READER,
  type VehiclePosition,
  type VehiclePositionsReader,
} from "../../reports/domain/ports/vehicle-positions-reader.port";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../drivers/domain/repositories/driver.repository";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import {
  countLiveStatuses,
  liveStatusFor,
  type LiveVehicleStatus,
} from "../domain/live-status";
import { ACTIVE_JOB_STATUSES, activeJobByVehicle } from "../domain/active-jobs";
import { applyVehicleSearch } from "../domain/vehicle-search";

export type LiveTrackingScope = {
  tenantId: string;
  /** Set for an owner operator: only their own vehicles are visible. */
  ownedVehicleIds: Set<string> | null;
  /** The search box. Applied after assembly, over the rows the map already holds. */
  query?: string;
};

/**
 * Everything the Live Tracking map needs for its first paint.
 *
 * One call rather than one per panel: the map, the vehicle list, the status bar
 * and the geofence layer all describe the same fleet at the same instant, and
 * assembling them from separate requests makes them disagree while the page
 * settles.
 */
@Injectable()
export class LiveTrackingUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepository,
    @Inject(VEHICLE_POSITIONS_READER) private readonly positions: VehiclePositionsReader,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(scope: LiveTrackingScope) {
    const [vehicles, drivers, positions, jobs] = await Promise.all([
      this.vehicles.findAll({ tenantId: scope.tenantId }),
      this.drivers.findAll({ tenantId: scope.tenantId }),
      this.positions.listLatestPositions(scope.tenantId).catch(() => [] as VehiclePosition[]),
      this.dispatchJobs.listJobs(scope.tenantId).catch(() => [] as DispatchJob[]),
    ]);

    const visible = (vehicles as unknown as Array<Record<string, unknown>>).filter(
      (vehicle) => scope.ownedVehicleIds === null || scope.ownedVehicleIds.has(String(vehicle["id"])),
    );

    const positionByVehicle = new Map(positions.map((position) => [position.vehicleId, position]));
    const jobByVehicle = activeJobByVehicle(jobs);
    const driverByVehicle = new Map(
      (drivers as unknown as Array<Record<string, unknown>>)
        .filter((driver) => driver["assignedVehicleId"])
        .map((driver) => [String(driver["assignedVehicleId"]), driver]),
    );

    const offlineAfterMs = this.config.liveTracking.offlineAfterMinutes * 60 * 1000;
    const now = Date.now();

    const rows = visible.map((vehicle) => {
      const id = String(vehicle["id"]);
      const position = positionByVehicle.get(id) ?? null;
      const job = jobByVehicle.get(id) ?? null;
      const driver = driverByVehicle.get(id) ?? null;

      const status: LiveVehicleStatus = liveStatusFor(
        {
          lastFixAt: position?.recordedAt ?? null,
          speedKph: position?.speedKph ?? null,
          hasActiveJob: job !== null,
        },
        offlineAfterMs,
        now,
      );

      return {
        vehicleId: id,
        registrationNumber: vehicle["registrationNumber"] ?? null,
        make: vehicle["make"] ?? null,
        model: vehicle["model"] ?? null,
        status,
        driver: driver ? { id: String(driver["id"]), name: String(driver["name"] ?? "") } : null,
        position: position
          ? {
              lat: position.latitude,
              lng: position.longitude,
              speedKph: position.speedKph,
              fixedAt: position.recordedAt,
            }
          : null,
        job: job
          ? {
              id: job.id,
              reference: job.reference,
              status: job.status,
              pickupAddress: job.pickupAddress,
              dropoffAddress: job.dropoffAddress,
              deadline: job.deadline,
            }
          : null,
        fuelLevel: vehicle["fuelLevel"] ?? null,
      };
    });

    // Counted before the search is applied: the status bar describes the fleet,
    // not the current filter.
    const counts = countLiveStatuses(rows.map((row) => row.status));

    return {
      vehicles: applyVehicleSearch(
        rows.map((row) => ({
          ...row,
          registrationNumber: (row.registrationNumber as string | null) ?? null,
          make: (row.make as string | null) ?? null,
          model: (row.model as string | null) ?? null,
          driverName: row.driver?.name ?? null,
        })),
        scope.query,
      ),
      counts,
      activeJobStatuses: [...ACTIVE_JOB_STATUSES],
      offlineAfterMinutes: this.config.liveTracking.offlineAfterMinutes,
      frameIntervalMs: this.config.liveTracking.frameIntervalMs,
      generatedAt: new Date().toISOString(),
    };
  }
}
