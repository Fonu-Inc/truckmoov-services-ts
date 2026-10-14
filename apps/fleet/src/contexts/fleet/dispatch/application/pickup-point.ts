import type { GeoPoint } from "../../tracking/domain/vehicle-position.repository";

export function pickupOf(query: { pickupLat?: number; pickupLng?: number }): GeoPoint | undefined {
  if (query.pickupLat == null || query.pickupLng == null) return undefined;
  return { lat: query.pickupLat, lng: query.pickupLng };
}
