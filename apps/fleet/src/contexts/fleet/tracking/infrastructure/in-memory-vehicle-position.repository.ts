import { Injectable } from "@nestjs/common";
import { haversineKm } from "../../../../utils/haversine";
import type {
  GeoPoint,
  PositionFix,
  VehiclePosition,
  VehiclePositionRepository,
} from "../domain/vehicle-position.repository";

type Stored = { deviceId: string | null; point: GeoPoint | null; recordedAt: number };

@Injectable()
export class InMemoryVehiclePositionRepository implements VehiclePositionRepository {
  private readonly store = new Map<string, Stored>();

  async record(fix: PositionFix): Promise<void> {
    const key = keyOf(fix.tenantId, fix.vehicleId);
    const existing = this.store.get(key);
    if (existing && existing.recordedAt > fix.recordedAt.getTime()) return;
    this.store.set(key, {
      deviceId: fix.deviceId ?? existing?.deviceId ?? null,
      point: fix.point ?? existing?.point ?? null,
      recordedAt: fix.recordedAt.getTime(),
    });
  }

  async findByVehicleIds(
    tenantId: string,
    vehicleIds: readonly string[],
    origin?: GeoPoint,
  ): Promise<Map<string, VehiclePosition>> {
    const found = new Map<string, VehiclePosition>();
    for (const vehicleId of vehicleIds) {
      const stored = this.store.get(keyOf(tenantId, vehicleId));
      if (stored) found.set(vehicleId, toPosition(vehicleId, stored, origin));
    }
    return found;
  }

  async nearest(
    tenantId: string,
    origin: GeoPoint,
    vehicleIds: readonly string[],
    limit: number,
  ): Promise<VehiclePosition[]> {
    const positions = await this.findByVehicleIds(tenantId, vehicleIds, origin);
    return [...positions.values()]
      .filter((position) => position.distanceKm !== null)
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
      .slice(0, limit);
  }
}

function keyOf(tenantId: string, vehicleId: string): string {
  return `${tenantId}:${vehicleId}`;
}

function toPosition(vehicleId: string, stored: Stored, origin?: GeoPoint): VehiclePosition {
  const { point } = stored;
  return {
    vehicleId,
    deviceId: stored.deviceId,
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    lastSeen: stored.recordedAt,
    distanceKm: origin && point ? haversineKm(origin.lat, origin.lng, point.lat, point.lng) : null,
  };
}
