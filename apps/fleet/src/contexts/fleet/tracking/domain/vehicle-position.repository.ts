export type GeoPoint = { lat: number; lng: number };

export type PositionFix = {
  tenantId: string;
  vehicleId: string;
  deviceId: string | null;
  point: GeoPoint | null;
  recordedAt: Date;
};

export type VehiclePosition = {
  vehicleId: string;
  deviceId: string | null;
  lat: number | null;
  lng: number | null;
  lastSeen: number;
  /** Distance to the requested origin in km; null without an origin or a position. */
  distanceKm: number | null;
};

/**
 * The latest known position of every vehicle, shared by every fleet replica.
 *
 * Fixes arrive through a JetStream consumer that hands each one to a single
 * replica, so a per-process store only ever saw part of the fleet.
 */
export interface VehiclePositionRepository {
  /** Keeps the newest fix per vehicle; an older, buffered upload never replaces a newer one. */
  record(fix: PositionFix): Promise<void>;
  findByVehicleIds(
    tenantId: string,
    vehicleIds: readonly string[],
    origin?: GeoPoint,
  ): Promise<Map<string, VehiclePosition>>;
  /** Closest positioned vehicles to the origin, limited to the given vehicles. */
  nearest(
    tenantId: string,
    origin: GeoPoint,
    vehicleIds: readonly string[],
    limit: number,
  ): Promise<VehiclePosition[]>;
}

export const VEHICLE_POSITION_REPOSITORY = Symbol("VEHICLE_POSITION_REPOSITORY");
