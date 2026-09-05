export type RegionCentroid = {
  region: string;
  latitude: number;
  longitude: number;
};

// Traccar reports coordinates, not place names, so a region is decided by
// nearest centroid. Kept as data rather than a geocoder call: the overview runs
// on every dashboard load and must not depend on a third party being up.
export const REGION_CENTROIDS: readonly RegionCentroid[] = [
  { region: "Lagos", latitude: 6.5244, longitude: 3.3792 },
  { region: "Abuja", latitude: 9.0765, longitude: 7.3986 },
  { region: "Port Harcourt", latitude: 4.8156, longitude: 7.0498 },
  { region: "Kano", latitude: 12.0022, longitude: 8.592 },
  { region: "Ibadan", latitude: 7.3775, longitude: 3.947 },
  { region: "Benin City", latitude: 6.335, longitude: 5.6037 },
  { region: "Kaduna", latitude: 10.5222, longitude: 7.4383 },
  { region: "Enugu", latitude: 6.4584, longitude: 7.5464 },
  { region: "Aba", latitude: 5.1066, longitude: 7.3667 },
  { region: "Jos", latitude: 9.8965, longitude: 8.8583 },
  { region: "Warri", latitude: 5.5167, longitude: 5.75 },
  { region: "Maiduguri", latitude: 11.8311, longitude: 13.151 },
];

export const UNKNOWN_REGION = "Unknown";

// Beyond this a fix belongs to no listed hub. Nigeria's hubs are far enough
// apart that 150km attributes intercity traffic to the nearer hub without
// swallowing the whole map into one region.
const MAX_REGION_RADIUS_KM = 150;

const EARTH_RADIUS_KM = 6371;

export function regionForPosition(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return UNKNOWN_REGION;
  }

  let closest = UNKNOWN_REGION;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const centroid of REGION_CENTROIDS) {
    const distance = haversineKm(latitude, longitude, centroid.latitude, centroid.longitude);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = centroid.region;
    }
  }

  return closestDistance <= MAX_REGION_RADIUS_KM ? closest : UNKNOWN_REGION;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
