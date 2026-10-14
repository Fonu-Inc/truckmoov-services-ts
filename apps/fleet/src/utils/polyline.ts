import type { GeoPoint } from "../contexts/fleet/tracking/domain/vehicle-position.repository";

/** Decodes a Google-encoded polyline; Valhalla uses precision 6. */
export function decodePolyline(encoded: string, precision = 6): GeoPoint[] {
  const factor = 10 ** precision;
  const points: GeoPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    [lat, index] = nextValue(encoded, index, lat);
    [lng, index] = nextValue(encoded, index, lng);
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

function nextValue(encoded: string, start: number, previous: number): [number, number] {
  let result = 0;
  let shift = 0;
  let index = start;
  let byte: number;
  do {
    byte = encoded.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < encoded.length);
  const delta = result & 1 ? ~(result >> 1) : result >> 1;
  return [previous + delta, index];
}
