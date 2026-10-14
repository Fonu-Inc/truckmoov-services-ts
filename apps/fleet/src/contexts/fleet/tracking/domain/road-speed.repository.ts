import type { GeoPoint } from "./vehicle-position.repository";

export type RoadBreach = {
  tenantId: string;
  vehicleId: string;
  at: Date;
  /** A breach confirms one recorded at most this long before it. */
  confirmWithinSeconds: number;
  /** After an alert the vehicle is not alerted again for this long. */
  cooldownMinutes: number;
};

export interface RoadSpeedRepository {
  /** Whether the point is in a town or city (GHSL built-up area). */
  isBuiltUp(point: GeoPoint): Promise<boolean>;
  /**
   * Records a breach and says whether it should alert: true when it confirms
   * an earlier breach within the window and the vehicle is out of cooldown.
   * Atomic, so two replicas never alert the same breach twice.
   */
  recordBreach(breach: RoadBreach): Promise<boolean>;
}

export const ROAD_SPEED_REPOSITORY = Symbol("ROAD_SPEED_REPOSITORY");
