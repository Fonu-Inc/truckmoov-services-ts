import type { StoredGeofenceZone } from "../../../../geofence-zone.repository";

export type Point = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;

/**
 * Whether a point is inside a zone.
 *
 * Two shapes, two tests. A circle is a distance check; a polygon is a ray cast.
 * Neither is approximated by the other: a bounding box around a delivery zone
 * on the Lekki peninsula covers a great deal of lagoon.
 */
export function isInsideZone(zone: StoredGeofenceZone, point: Point): boolean {
  if (zone.radiusMeters !== null && zone.centerLatitude !== null && zone.centerLongitude !== null) {
    return (
      distanceMeters(point, { lat: zone.centerLatitude, lng: zone.centerLongitude })
      <= zone.radiusMeters
    );
  }

  return zone.coordinates.length >= 3 && isInsidePolygon(zone.coordinates, point);
}

export function distanceMeters(a: Point, b: Point): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);

  const h =
    Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Ray casting. Counts how many edges a ray due east from the point crosses:
 * odd means inside.
 *
 * Coordinates are stored as [lat, lng] pairs. Treated as planar, which is
 * accurate enough for zones measured in kilometres and avoids projecting every
 * polygon on every position.
 */
export function isInsidePolygon(coordinates: Array<[number, number]>, point: Point): boolean {
  let inside = false;

  for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i, i += 1) {
    const [latI, lngI] = coordinates[i];
    const [latJ, lngJ] = coordinates[j];

    // The edge must straddle the point's latitude for the ray to cross it. The
    // strict/non-strict pairing keeps a vertex from being counted twice.
    const straddles = latI > point.lat !== latJ > point.lat;
    if (!straddles) continue;

    const crossingLng = ((lngJ - lngI) * (point.lat - latI)) / (latJ - latI) + lngI;
    if (point.lng < crossingLng) inside = !inside;
  }

  return inside;
}

/** Whether the zone is watching this vehicle at all. Empty means every vehicle. */
export function zoneWatchesVehicle(zone: StoredGeofenceZone, vehicleId: string): boolean {
  return zone.assignedVehicleIds.length === 0 || zone.assignedVehicleIds.includes(vehicleId);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
