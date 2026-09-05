import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../drivers/domain/repositories/driver.repository";
import {
  DISPATCH_JOBS_READER,
  type DispatchActiveJobsMap,
  type DispatchJob,
  type DispatchJobsReader,
} from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import { ALERT_REPOSITORY, type AlertRepository } from "../../alerts/domain/alert.repository";
import {
  VEHICLE_POSITIONS_READER,
  type VehiclePosition,
  type VehiclePositionsReader,
} from "../domain/ports/vehicle-positions-reader.port";
import { RECENT_CHATS_READER, type RecentChatsReader } from "../domain/ports/recent-chats-reader.port";
import { regionForPosition } from "../domain/region-from-position";
import type { OverviewScope } from "../domain/overview-scope";
import { AuditLogService } from "../../../../audit-log.service";

// The design shows five rows per list, ten for the activity feed. Enforced here
// rather than by the caller: an overview that can be asked for everything is a
// listing endpoint wearing a dashboard's name.
const LIST_LIMIT = 5;
const ACTIVITY_LIMIT = 10;

const COMPLETED_JOB_STATUSES = new Set(["delivered", "completed"]);
const ACTIVE_VEHICLE_STATUSES = new Set(["active"]);

export type OverviewResponse = ReturnType<OverviewUseCase["build"]> extends Promise<infer T> ? T : never;

@Injectable()
export class OverviewUseCase {
  private readonly cache = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly driverRepo: DriverRepository,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: AlertRepository,
    @Inject(VEHICLE_POSITIONS_READER) private readonly positions: VehiclePositionsReader,
    @Inject(RECENT_CHATS_READER) private readonly chats: RecentChatsReader,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(scope: OverviewScope) {
    const key = `${scope.tenantId}:${scope.ownerOperatorId ?? "*"}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as Awaited<ReturnType<OverviewUseCase["build"]>>;
    }

    const value = await this.build(scope);
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.config.overview.cacheTtlSeconds * 1000,
    });
    return value;
  }

  private async build(scope: OverviewScope) {
    const [vehicles, drivers, jobs, alerts, positions, chats, activity, activeJobsMap] = await Promise.all([
      this.vehicleRepo.findAll({ tenantId: scope.tenantId }),
      this.driverRepo.findAll({ tenantId: scope.tenantId }),
      this.dispatchJobs.listJobs(scope.tenantId),
      this.alertRepo.findAll(scope.tenantId),
      this.positions.listLatestPositions(scope.tenantId),
      this.chats.listRecentChats(scope.tenantId, LIST_LIMIT),
      this.auditLog.query(scope.tenantId, { limit: ACTIVITY_LIMIT }),
      this.dispatchJobs.listActiveJobsMap(scope.tenantId),
    ]);

    // Owner operators are pinned to their own records before anything is
    // counted, so no total in this response can include a neighbour's asset.
    const ownedVehicles = vehicles.filter(
      (vehicle) => scope.ownerOperatorId === null || vehicle.ownerOperatorId === scope.ownerOperatorId,
    );
    const ownedVehicleIds = new Set(ownedVehicles.map((vehicle) => vehicle.id));
    const ownedDrivers = drivers.filter(
      (driver) =>
        scope.ownerOperatorId === null ||
        (driver.assignedVehicleId !== null && ownedVehicleIds.has(driver.assignedVehicleId)),
    );
    const ownedDriverIds = new Set(ownedDrivers.map((driver) => driver.id));
    const ownedJobs = jobs.filter((job) => this.jobBelongsToScope(job, scope, ownedVehicleIds, ownedDriverIds));
    const ownedAlerts = alerts.filter(
      (alert) => scope.ownerOperatorId === null || (alert.vehicleId !== null && ownedVehicleIds.has(alert.vehicleId)),
    );
    const ownedPositions = positions.filter(
      (position) => scope.ownerOperatorId === null || ownedVehicleIds.has(position.vehicleId),
    );
    const ownedMap = this.scopeActiveJobsMap(activeJobsMap, scope, ownedVehicleIds, ownedDriverIds);

    return {
      cards: {
        totalVehicles: ownedVehicles.length,
        totalJobs: ownedJobs.length,
        totalDrivers: ownedDrivers.length,
        revenueThisMonthNgn: this.revenueThisMonth(ownedJobs),
      },
      map: ownedMap,
      jobs: {
        total: ownedJobs.length,
        items: this.recentJobs(ownedJobs),
      },
      vehicles: {
        total: ownedVehicles.length,
        items: ownedVehicles.slice(0, LIST_LIMIT).map((vehicle) => ({
          id: vehicle.id,
          plateNumber: vehicle.plateNumber,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          status: vehicle.status,
        })),
      },
      drivers: {
        total: ownedDrivers.length,
        items: ownedDrivers.slice(0, LIST_LIMIT).map((driver) => ({
          id: driver.id,
          name: driver.name,
          phone: driver.phone ?? null,
          licenseNumber: driver.licenseNumber,
          status: driver.status,
          performanceScore: driver.performanceScore ?? null,
        })),
      },
      fleetUtilization: this.fleetUtilization(ownedVehicles, ownedPositions),
      alerts: this.recentAlerts(ownedAlerts),
      recentActivity: activity.slice(0, ACTIVITY_LIMIT).map((entry) => ({
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        summary: typeof entry.metadata?.summary === "string" ? entry.metadata.summary : entry.action,
        occurredAt: entry.occurredAt,
      })),
      recentChats: chats,
      generatedAt: new Date().toISOString(),
    };
  }

  private jobBelongsToScope(
    job: DispatchJob,
    scope: OverviewScope,
    ownedVehicleIds: Set<string>,
    ownedDriverIds: Set<string>,
  ): boolean {
    if (scope.ownerOperatorId === null) return true;
    if (job.assignedVehicleId !== null && ownedVehicleIds.has(job.assignedVehicleId)) return true;
    return job.assignedDriverId !== null && ownedDriverIds.has(job.assignedDriverId);
  }

  private scopeActiveJobsMap(
    map: DispatchActiveJobsMap,
    scope: OverviewScope,
    ownedVehicleIds: Set<string>,
    ownedDriverIds: Set<string>,
  ): DispatchActiveJobsMap {
    if (scope.ownerOperatorId === null) return map;

    const jobs = map.jobs.filter(
      (job) =>
        (job.assignedVehicleId !== null && ownedVehicleIds.has(job.assignedVehicleId)) ||
        (job.assignedDriverId !== null && ownedDriverIds.has(job.assignedDriverId)),
    );

    // Counts are recomputed rather than reused: dispatch counted the whole
    // tenant, and an owner operator must not be told how busy it is.
    const counts = { activeDeliveries: jobs.length, stops: 0, pickups: 0, dropoffs: 0 };
    for (const job of jobs) {
      for (const waypoint of job.waypoints) {
        counts.stops += 1;
        if (waypoint.type === "pickup") counts.pickups += 1;
        if (waypoint.type === "dropoff") counts.dropoffs += 1;
      }
    }
    return { jobs, counts };
  }

  private revenueThisMonth(jobs: DispatchJob[]): number {
    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);

    return jobs
      .filter((job) => {
        if (!COMPLETED_JOB_STATUSES.has(job.status)) return false;
        const completedAt = Date.parse(job.punctuality?.completedAt || job.updatedAt);
        return Number.isFinite(completedAt) && completedAt >= monthStart;
      })
      .reduce((total, job) => total + (job.amountNgn ?? 0), 0);
  }

  private recentJobs(jobs: DispatchJob[]) {
    return [...jobs]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, LIST_LIMIT)
      .map((job) => ({
        id: job.id,
        reference: job.reference,
        status: job.status,
        pickupAddress: job.pickupAddress,
        dropoffAddress: job.dropoffAddress,
        amountNgn: job.amountNgn,
        createdAt: job.createdAt,
      }));
  }

  private recentAlerts(alerts: Awaited<ReturnType<AlertRepository["findAll"]>>) {
    const thresholdMs = this.config.overview.alertThresholdHours * 60 * 60 * 1000;
    const cutoff = Date.now() - thresholdMs;

    const recent = alerts
      .filter((alert) => alert.triggeredAt.getTime() >= cutoff)
      .sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());

    return {
      total: recent.length,
      thresholdHours: this.config.overview.alertThresholdHours,
      items: recent.slice(0, LIST_LIMIT).map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        status: alert.status,
        details: alert.details,
        vehicleId: alert.vehicleId,
        triggeredAt: alert.triggeredAt.toISOString(),
      })),
    };
  }

  /**
   * In-use versus idle per region. A vehicle's region comes from its last
   * Traccar fix; one that has not reported inside the freshness window is
   * counted as idle rather than placed on a stale position.
   */
  private fleetUtilization(
    vehicles: Awaited<ReturnType<VehicleRepository["findAll"]>>,
    positions: VehiclePosition[],
  ) {
    const freshnessMs = this.config.overview.positionFreshnessMinutes * 60 * 1000;
    const cutoff = Date.now() - freshnessMs;

    const positionByVehicle = new Map<string, VehiclePosition>();
    for (const position of positions) positionByVehicle.set(position.vehicleId, position);

    const byRegion = new Map<string, { region: string; inUse: number; idle: number }>();
    for (const vehicle of vehicles) {
      const position = positionByVehicle.get(vehicle.id);
      const fresh = position !== undefined && Date.parse(position.recordedAt) >= cutoff;
      const region = fresh ? regionForPosition(position.latitude, position.longitude) : "Unknown";
      const inUse = fresh && ACTIVE_VEHICLE_STATUSES.has(vehicle.status);

      const bucket = byRegion.get(region) ?? { region, inUse: 0, idle: 0 };
      if (inUse) bucket.inUse += 1;
      else bucket.idle += 1;
      byRegion.set(region, bucket);
    }

    return [...byRegion.values()]
      .map((bucket) => {
        const total = bucket.inUse + bucket.idle;
        return {
          ...bucket,
          total,
          utilizationPercent: total === 0 ? 0 : Math.round((bucket.inUse / total) * 100),
        };
      })
      .sort((a, b) => b.total - a.total || a.region.localeCompare(b.region));
  }
}
