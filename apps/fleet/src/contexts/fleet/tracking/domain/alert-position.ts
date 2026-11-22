/** Where an alert happened, read from its details. Fleet evaluators write lat/lng; tracking writes latitude/longitude. */
export function alertPosition(details: Record<string, unknown> | null | undefined): {
  latitude: number | null;
  longitude: number | null;
} {
  const latitude = coordinate(details?.["lat"] ?? details?.["latitude"], 90);
  const longitude = coordinate(details?.["lng"] ?? details?.["longitude"], 180);
  return latitude === null || longitude === null ? { latitude: null, longitude: null } : { latitude, longitude };
}

function coordinate(value: unknown, limit: number): number | null {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}
