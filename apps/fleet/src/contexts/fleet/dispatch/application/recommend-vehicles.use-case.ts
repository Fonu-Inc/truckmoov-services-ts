import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import { VehicleHealthService } from "../../../../vehicle-health.service";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "../domain/ports/dispatch-jobs-reader.port";
import { ACTIVE_JOB_STATUSES } from "../domain/active-job-statuses";
import { haversineKm } from "../../../../utils/haversine";

export type RecommendVehiclesQuery = {
  requiredWeightKg?: number;
  vehicleType?: string;
  fuelType?: string;
  pickupLat?: number;
  pickupLng?: number;
  limit?: number;
};

export type RecommendedVehicleRank = {
  vehicleId: string;
  plateNumber: string;
  make: string | null;
  model: string;
  type: string | null;
  fuelType: string | null;
  status: string;
  capacityWeightKg: number | null;
  score: number;
  distanceKm: number | null;
  reasons: string[];
};

type Candidate = {
  id: string;
  plateNumber: string;
  make: string | null;
  model: string;
  type: string | null;
  fuelType?: string | null;
  status: string;
  capacityWeightKg: number | null;
};

type Factor = { value: number; reason?: string };

const WEIGHTS = { availability: 0.35, capacity: 0.25, type: 0.1, fuel: 0.05, proximity: 0.15, freshness: 0.1 };
const PROXIMITY_MAX_KM = 50;
const FRESH_WINDOW_MS = 3_600_000;
const UNUSABLE_STATUSES = new Set(["maintenance", "decommissioned"]);

/**
 * Ranks vehicles for a job the way recommend-drivers ranks drivers. A vehicle
 * on an active job or out of service is kept but sinks, so the dispatcher
 * still sees why it was not offered first.
 */
@Injectable()
export class RecommendVehiclesUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    private readonly health: VehicleHealthService,
  ) {}

  async execute(tenantId: string, query: RecommendVehiclesQuery): Promise<RecommendedVehicleRank[]> {
    const [vehicles, jobs] = await Promise.all([
      this.vehicleRepo.findAll({ tenantId }),
      this.dispatchJobs.listJobs(tenantId),
    ]);
    const busy = new Set(
      jobs
        .filter((job) => ACTIVE_JOB_STATUSES.has(job.status))
        .map((job) => job.assignedVehicleId)
        .filter((id): id is string => !!id),
    );
    const limit = query.limit && query.limit > 0 ? query.limit : 10;

    return vehicles
      .map((vehicle) => this.rank(vehicle, query, busy.has(vehicle.id)))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private rank(vehicle: Candidate, query: RecommendVehiclesQuery, onActiveJob: boolean): RecommendedVehicleRank {
    const fix = this.health.get(vehicle.id);
    const distanceKm = distanceTo(query, fix);
    const factors = {
      availability: availabilityOf(vehicle, onActiveJob),
      capacity: capacityFit(vehicle.capacityWeightKg, query.requiredWeightKg),
      type: match(vehicle.type, query.vehicleType, "type"),
      fuel: match(vehicle.fuelType ?? null, query.fuelType, "fuel"),
      proximity: proximityOf(distanceKm),
      freshness: freshnessOf(fix?.lastSeen),
    };
    const score = Object.entries(factors).reduce(
      (total, [name, factor]) => total + factor.value * WEIGHTS[name as keyof typeof WEIGHTS],
      0,
    );

    return {
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      make: vehicle.make,
      model: vehicle.model,
      type: vehicle.type,
      fuelType: vehicle.fuelType ?? null,
      status: vehicle.status,
      capacityWeightKg: vehicle.capacityWeightKg,
      score: Math.round(100 * score),
      distanceKm: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
      reasons: Object.values(factors).flatMap((factor) => (factor.reason ? [factor.reason] : [])),
    };
  }
}

function availabilityOf(vehicle: Candidate, onActiveJob: boolean): Factor {
  if (onActiveJob) return { value: 0.05, reason: "on active dispatch job" };
  if (UNUSABLE_STATUSES.has(vehicle.status)) return { value: 0, reason: vehicle.status };
  return vehicle.status === "active" ? { value: 1, reason: "free" } : { value: 0.3, reason: vehicle.status };
}

function capacityFit(capacityKg: number | null, requiredKg: number | undefined): Factor {
  if (!requiredKg || requiredKg <= 0) return { value: 0.7 };
  if (capacityKg == null) return { value: 0.3, reason: "capacity unknown" };
  const value = capacityKg >= requiredKg ? 1 : Math.max(0, capacityKg / requiredKg);
  return { value, reason: `capacity ${capacityKg}kg vs ${requiredKg}kg needed` };
}

function match(actual: string | null, wanted: string | undefined, label: string): Factor {
  if (!wanted) return { value: 0.7 };
  if (actual === wanted) return { value: 1, reason: `${label} match: ${actual}` };
  return { value: 0.3 };
}

function distanceTo(query: RecommendVehiclesQuery, fix: { lat: number | null; lng: number | null } | null | undefined) {
  if (query.pickupLat == null || query.pickupLng == null || fix?.lat == null || fix?.lng == null) return null;
  return haversineKm(query.pickupLat, query.pickupLng, fix.lat, fix.lng);
}

function proximityOf(distanceKm: number | null): Factor {
  if (distanceKm == null) return { value: 0.5 };
  return { value: Math.max(0, 1 - distanceKm / PROXIMITY_MAX_KM), reason: `${distanceKm.toFixed(1)}km away` };
}

function freshnessOf(lastSeen: number | undefined): Factor {
  if (lastSeen != null && Date.now() - lastSeen <= FRESH_WINDOW_MS) return { value: 1, reason: "recently seen" };
  return { value: 0.3 };
}
