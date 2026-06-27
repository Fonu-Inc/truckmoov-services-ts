import { Inject, Injectable } from "@nestjs/common";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../drivers/domain/repositories/driver.repository";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import { VehicleHealthService } from "../../../../vehicle-health.service";

export type RecommendDriversQuery = {
  requiredCapacity?: number;
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
    private readonly health: VehicleHealthService,
  ) {}

  async execute(tenantId: string, query: RecommendDriversQuery): Promise<RecommendedDriver[]> {
    const [drivers, vehicles] = await Promise.all([
      this.driverRepo.findAll({ tenantId }),
      this.vehicleRepo.findAll({ tenantId }),
    ]);
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const limit = query.limit && query.limit > 0 ? query.limit : 10;

    const ranked = drivers
      .filter((d) => d.status !== "suspended")
      .map((d) => this.rank(d, vehicleById.get(d.assignedVehicleId ?? "") ?? null, query))
      .sort((a, b) => b.score - a.score);

    return ranked.slice(0, limit);
  }

  private rank(
    driver: { id: string; name: string; status: string; assignedVehicleId: string | null },
    vehicle: { id: string; plateNumber: string; type: string | null; capacity: number | null; status: string } | null,
    query: RecommendDriversQuery,
  ): RecommendedDriver {
    const reasons: string[] = [];

    const availability = driver.status === "available" ? 1 : driver.status === "active" ? 0.6 : 0.1;
    reasons.push(driver.status);

    let capacity = 0.7;
    if (vehicle?.capacity != null && query.requiredCapacity != null && query.requiredCapacity > 0) {
      capacity = vehicle.capacity >= query.requiredCapacity ? 1 : Math.max(0, vehicle.capacity / query.requiredCapacity);
      reasons.push(`capacity ${vehicle.capacity}t vs ${query.requiredCapacity}t needed`);
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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
