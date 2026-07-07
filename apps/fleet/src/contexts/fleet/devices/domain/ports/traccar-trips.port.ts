export type TraccarTrip = {
  startTime: string;
  endTime: string;
  startAddress: string | null;
  endAddress: string | null;
  distanceMeters: number;
  durationMs: number;
};

/**
 * Reads historical trip reports from Traccar (already computes stop-detection
 * and, when its geocoder is enabled, start/end address names).
 */
export interface TraccarTripsProvider {
  getTrips(traccarDeviceId: string, from: Date, to: Date): Promise<TraccarTrip[]>;
}

export const TRACCAR_TRIPS_PROVIDER = Symbol("TRACCAR_TRIPS_PROVIDER");
