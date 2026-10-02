import { Inject, Injectable } from "@nestjs/common";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../drivers/domain/repositories/driver.repository";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import { VehicleHealthService } from "../../../../vehicle-health.service";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "../domain/ports/dispatch-jobs-reader.port";
import { ACTIVE_JOB_STATUSES } from "../domain/active-job-statuses";
import { haversineKm } from "../../../../utils/haversine";

export type RecommendDriversQuery = {
  /** Tonnes. Kept for older callers; requiredWeightKg wins when both are sent. */
  requiredCapacity?: number;
  requiredWeightKg?: number;
  vehicleType?: string;
  pickupLat?: number;
  pickupLng?: number;
  limit?: number;
};

export type RecommendedVehicle = {
  id: string;
  plateNumber: string;
  type: string | null;
  capacity: number | null;
  status: string;
};

export type RecommendedDriver = {
  driverId: string;
  driverName: string;
  status: string;
  assignedVehicleId: string | null;
  vehicle: RecommendedVehicle | null;
  score: number;
  distanceKm: number | null;
  reasons: string[];
};

const WEIGHTS = { availability: 0.35, capacity: 0.25, type: 0.15, proximity: 0.15, freshness: 0.1 };
const PROXIMITY_MAX_KM = 50;
const FRESH_WINDOW_MS = 3_600_000;

@Injectable()
export class RecommendDriversUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY) private readonly driverRepo: DriverRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    private readonly health: VehicleHealthService,
  ) {}

  async execute(
    tenantId: string,
    query: RecommendDriversQuery,
    ownedVehicleIds: ReadonlySet<string> | null = null,
  ): Promise<RecommendedDriver[]> {
    const [allDrivers, allVehicles, jobs] = await Promise.all([
      this.driverRepo.findAll({ tenantId }),
      this.vehicleRepo.findAll({ tenantId }),
      this.dispatchJobs.listJobs(tenantId),
    ]);
    const vehicles = ownedVehicleIds ? allVehicles.filter((v) => ownedVehicleIds.has(v.id)) : allVehicles;
    const drivers = ownedVehicleIds
      ? allDrivers.filter((d) => d.assignedVehicleId !== null && ownedVehicleIds.has(d.assignedVehicleId))
      : allDrivers;
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const busyDriverIds = new Set(
      jobs
        .filter((j) => ACTIVE_JOB_STATUSES.has(j.status))
        .map((j) => j.assignedDriverId)
        .filter((id): id is string => !!id),
    );
    const limit = query.limit && query.limit > 0 ? query.limit : 10;

    const ranked = drivers
      .filter((d) => d.status !== "suspended")
      .map((d) => this.rank(d, vehicleById.get(d.assignedVehicleId ?? "") ?? null, query, busyDriverIds.has(d.id)))
      .sort((a, b) => b.score - a.score);

    return ranked.slice(0, limit);
  }

  private rank(
    driver: { id: string; name: string; status: string; assignedVehicleId: string | null },
    vehicle: {
      id: string;
      plateNumber: string;
      type: string | null;
      capacity: number | null;
      capacityWeightKg: number | null;
      status: string;
    } | null,
    query: RecommendDriversQuery,
    onActiveJob: boolean,
  ): RecommendedDriver {
    const reasons: string[] = [];

    const availability = onActiveJob ? 0.05 : driver.status === "available" ? 1 : driver.status === "active" ? 0.6 : 0.1;
    reasons.push(onActiveJob ? "on active dispatch job" : driver.status);

    let capacity = 0.7;
    const requiredKg = requiredWeightKg(query);
    if (vehicle?.capacityWeightKg != null && requiredKg) {
      capacity = vehicle.capacityWeightKg >= requiredKg ? 1 : Math.max(0, vehicle.capacityWeightKg / requiredKg);
      reasons.push(`capacity ${vehicle.capacityWeightKg}kg vs ${requiredKg}kg needed`);
    } else if (!vehicle) {
      capacity = 0;
      reasons.push("no assigned vehicle");
    }

    let type = 0.7;
    if (query.vehicleType && vehicle?.type) {
      type = vehicle.type === query.vehicleType ? 1 : 0.3;
      if (type === 1) reasons.push(`type match: ${vehicle.type}`);
    } else if (query.vehicleType && !vehicle?.type) {
      type = 0.3;
    }

    const fix = vehicle ? this.health.get(vehicle.id) : null;

    let proximity = 0.5;
    let distanceKm: number | null = null;
    if (query.pickupLat != null && query.pickupLng != null && fix?.lat != null && fix?.lng != null) {
      distanceKm = haversineKm(query.pickupLat, query.pickupLng, fix.lat, fix.lng);
      proximity = Math.max(0, 1 - distanceKm / PROXIMITY_MAX_KM);
      reasons.push(`${distanceKm.toFixed(1)}km away`);
    }

    let freshness = 0.3;
    if (fix && Date.now() - fix.lastSeen <= FRESH_WINDOW_MS) {
      freshness = 1;
      reasons.push("recently seen");
    }

    const score = Math.round(
      100 *
        (availability * WEIGHTS.availability +
          capacity * WEIGHTS.capacity +
          type * WEIGHTS.type +
          proximity * WEIGHTS.proximity +
          freshness * WEIGHTS.freshness),
    );

    return {
      driverId: driver.id,
      driverName: driver.name,
      status: driver.status,
      assignedVehicleId: driver.assignedVehicleId,
      vehicle: vehicle
        ? { id: vehicle.id, plateNumber: vehicle.plateNumber, type: vehicle.type, capacity: vehicle.capacity, status: vehicle.status }
        : null,
      score,
      distanceKm: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
      reasons,
    };
  }
}

function requiredWeightKg(query: RecommendDriversQuery): number | null {
  if (query.requiredWeightKg && query.requiredWeightKg > 0) return query.requiredWeightKg;
  if (query.requiredCapacity && query.requiredCapacity > 0) return query.requiredCapacity * 1000;
  return null;
}
