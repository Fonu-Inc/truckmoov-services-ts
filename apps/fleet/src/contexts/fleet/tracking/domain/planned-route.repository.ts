import type { GeoPoint } from "./vehicle-position.repository";

export interface PlannedRouteRepository {
  /** Sets the vehicle's route to this job's line and clears any off-route count. */
  replace(tenantId: string, vehicleId: string, jobId: string, line: GeoPoint[]): Promise<void>;
  removeJob(tenantId: string, jobId: string): Promise<void>;
  /**
   * Records whether a fix is within `bufferMeters` of the vehicle's route.
   * Returns the job id exactly once per excursion: on the fix that makes it
   * `confirmFixes` in a row off route. A fix back on route resets the count.
   */
  checkFix(
    tenantId: string,
    vehicleId: string,
    point: GeoPoint,
    bufferMeters: number,
    confirmFixes: number,
  ): Promise<string | null>;
}

export const PLANNED_ROUTE_REPOSITORY = Symbol("PLANNED_ROUTE_REPOSITORY");
