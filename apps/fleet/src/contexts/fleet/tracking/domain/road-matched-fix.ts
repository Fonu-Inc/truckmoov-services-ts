import type { GeoPoint } from "./vehicle-position.repository";

/** A fix snapped onto the road it was driven on, from tracking's `vehicle.road.matched`. */
export type RoadMatchedFix = {
  tenantId: string;
  vehicleId: string;
  point: GeoPoint;
  speedKph: number;
  roadClass: string;
  roadName: string;
  osmSpeedLimitKph: number | null;
  wayId: number;
  at: Date;
};
