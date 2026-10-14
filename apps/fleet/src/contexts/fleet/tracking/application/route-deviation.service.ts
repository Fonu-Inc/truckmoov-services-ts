import { Inject, Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { decodePolyline } from "../../../../utils/polyline";
import {
  DISPATCH_JOBS_READER,
  type DispatchJobsReader,
} from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import { ACTIVE_JOB_STATUSES } from "../../dispatch/domain/active-job-statuses";
import { PLANNED_ROUTE_REPOSITORY, type PlannedRouteRepository } from "../domain/planned-route.repository";
import type { RoadMatchedFix } from "../domain/road-matched-fix";
import type { GeoPoint } from "../domain/vehicle-position.repository";

export type JobStatusChange = {
  tenantId: string;
  jobId: string;
  newStatus: string;
  vehicleId: string | null;
};

export type RouteDeviationAlert = {
  type: "route_deviation";
  severity: "medium";
  jobId: string;
  details: Record<string, unknown>;
};

/**
 * Off-route detection against the route dispatch planned for the job. Fixes
 * come snapped to the road by map matching, so a wobble in GPS does not read
 * as a detour, and a deviation needs consecutive fixes outside the corridor.
 */
@Injectable()
export class RouteDeviationService {
  private readonly logger = new Logger(RouteDeviationService.name);

  constructor(
    @Inject(PLANNED_ROUTE_REPOSITORY) private readonly routes: PlannedRouteRepository,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async check(fix: RoadMatchedFix): Promise<RouteDeviationAlert | null> {
    const { bufferMeters, confirmFixes } = this.config.routeDeviation;
    const jobId = await this.routes.checkFix(fix.tenantId, fix.vehicleId, fix.point, bufferMeters, confirmFixes);
    if (!jobId) return null;
    return {
      type: "route_deviation",
      severity: "medium",
      jobId,
      details: {
        jobId,
        roadName: fix.roadName || null,
        corridorMeters: bufferMeters,
        lat: fix.point.lat,
        lng: fix.point.lng,
        at: fix.at.toISOString(),
      },
    };
  }

  /**
   * Keeps the vehicle's planned route in step with the job dispatch says it is
   * on. Removing a route must not be lost, or the truck's next trips read as
   * deviations from a dead corridor, so a failed removal throws for redelivery.
   * A route dispatch cannot supply right now only means no deviation check.
   */
  async syncJob(change: JobStatusChange): Promise<void> {
    await this.routes.removeJob(change.tenantId, change.jobId);
    if (!change.vehicleId || !ACTIVE_JOB_STATUSES.has(change.newStatus)) return;

    try {
      const line = await this.plannedLine(change.tenantId, change.jobId);
      if (line.length >= 2) await this.routes.replace(change.tenantId, change.vehicleId, change.jobId, line);
    } catch (error) {
      this.logger.warn(`planned_route_unavailable:${change.jobId}:${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  private async plannedLine(tenantId: string, jobId: string): Promise<GeoPoint[]> {
    const { jobs } = await this.dispatchJobs.listActiveJobsMap(tenantId);
    const job = jobs.find((candidate) => candidate.jobId === jobId);
    if (!job?.routeShape || job.routeEncoding !== "polyline6") return [];
    // One polyline per leg, joined with ";".
    return job.routeShape.split(";").flatMap((leg) => decodePolyline(leg, 6));
  }
}
