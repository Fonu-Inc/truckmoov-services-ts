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
// Owner operators are filtered after the audit read, so the scan has to be
// wider than the feed or a neighbouring operator's events could fill it.
const ACTIVITY_SCAN_LIMIT = ACTIVITY_LIMIT * 5;

const COMPLETED_JOB_STATUSES = new Set(["delivered", "completed"]);
const ACTIVE_VEHICLE_STATUSES = new Set(["active"]);
// Dispatch's map only carries its own busy statuses; an in-progress job may
// arrive from the jobs list instead, so both sources are checked.
const OPERATIONAL_JOB_STATUSES = new Set([
  "assigned",
  "accepted",
  "en_route",
  "en-route",
  "arrived",
  "arrived_pickup",
  "loaded",
  "in_progress",
  "arrived_dropoff",
]);

type OverviewVehicle = Awaited<ReturnType<VehicleRepository["findAll"]>>[number];
type OverviewDriver = Awaited<ReturnType<DriverRepository["findAll"]>>[number];
type OverviewAuditEntry = Awaited<ReturnType<AuditLogService["query"]>>[number];

type OperationalJob = {
  jobId: string;
  reference: string;
  status: string;
  driverId: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
};

type ActivityItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  occurredAt: string;
  title: string;
  description: string | null;
};

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
      this.auditLog.query(scope.tenantId, { limit: ACTIVITY_SCAN_LIMIT }),
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
      vehiclesInOperation: this.vehiclesInOperation(
        ownedVehicles,
        ownedDrivers,
        ownedJobs,
        ownedMap,
      ),
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
      recentActivity: this.recentActivity(activity, {
        scope,
        jobs: ownedJobs,
        vehicles: ownedVehicles,
        drivers: ownedDrivers,
        ownedVehicleIds,
      }),
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

  /**
   * Active vehicles with the driver and route they are currently running.
   * Dispatch's map is the freshest source for a job's waypoints; the jobs list
   * covers the in-progress statuses the map does not carry.
   */
  private vehiclesInOperation(
    vehicles: OverviewVehicle[],
    drivers: OverviewDriver[],
    jobs: DispatchJob[],
    activeJobsMap: DispatchActiveJobsMap,
  ) {
    const jobByVehicle = new Map<string, OperationalJob>();

    for (const job of activeJobsMap.jobs) {
      if (!job.assignedVehicleId || jobByVehicle.has(job.assignedVehicleId)) continue;
      const pickup = job.waypoints.find((waypoint) => waypoint.type === "pickup")?.address
        ?? job.waypoints[0]?.address
        ?? null;
      const dropoff = [...job.waypoints].reverse().find((waypoint) => waypoint.type === "dropoff")?.address
        ?? job.waypoints[job.waypoints.length - 1]?.address
        ?? null;
      jobByVehicle.set(job.assignedVehicleId, {
        jobId: job.jobId,
        reference: job.reference,
        status: job.status,
        driverId: job.assignedDriverId,
        pickupAddress: pickup,
        dropoffAddress: dropoff,
      });
    }

    for (const job of [...jobs].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))) {
      if (!job.assignedVehicleId || jobByVehicle.has(job.assignedVehicleId)) continue;
      if (!OPERATIONAL_JOB_STATUSES.has(job.status)) continue;
      jobByVehicle.set(job.assignedVehicleId, {
        jobId: job.id,
        reference: job.reference,
        status: job.status,
        driverId: job.assignedDriverId,
        pickupAddress: job.pickupAddress,
        dropoffAddress: job.dropoffAddress,
      });
    }

    const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
    const items = vehicles
      .filter((vehicle) => vehicle.status === "active")
      .map((vehicle) => {
        const job = jobByVehicle.get(vehicle.id);
        const driverId = job?.driverId ?? vehicle.assignedDriverId;
        return {
          vehicleId: vehicle.id,
          plateNumber: vehicle.plateNumber,
          driverId,
          driverName: driverId ? driverById.get(driverId)?.name ?? null : null,
          jobId: job?.jobId ?? null,
          jobReference: job?.reference ?? null,
          pickupAddress: job?.pickupAddress ?? null,
          dropoffAddress: job?.dropoffAddress ?? null,
          status: vehicle.status,
        };
      });

    return { total: items.length, items };
  }

  /**
   * The activity card mixes the audit trail with the current records: real
   * events when they exist, and the latest job/vehicle/driver state when the
   * audit log is empty (seeded tenants, older records). Audit rows are scoped
   * before they are mapped so an owner operator never sees a neighbour's feed.
   */
  private recentActivity(
    entries: OverviewAuditEntry[],
    context: {
      scope: OverviewScope;
      jobs: DispatchJob[];
      vehicles: OverviewVehicle[];
      drivers: OverviewDriver[];
      ownedVehicleIds: Set<string>;
    },
  ): ActivityItem[] {
    const jobById = new Map(context.jobs.map((job) => [job.id, job]));
    const vehicleById = new Map(context.vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const driverById = new Map(context.drivers.map((driver) => [driver.id, driver]));

    const visible = entries.filter((entry) => {
      if (entry.entityType === "job") return jobById.has(entry.entityId);
      if (entry.entityType === "vehicle") return vehicleById.has(entry.entityId);
      if (entry.entityType === "driver") return driverById.has(entry.entityId);
      if (context.scope.ownerOperatorId === null) return true;

      if (entry.entityType === "alert") {
        const vehicleId = typeof entry.metadata?.vehicleId === "string" ? entry.metadata.vehicleId : null;
        return vehicleId !== null && context.ownedVehicleIds.has(vehicleId);
      }

      // Anything else cannot be proven to belong to this operator, so it is
      // left out rather than guessed at.
      return false;
    });

    const mapped = visible.map((entry) => this.describeActivity(entry, jobById, vehicleById, driverById));
    const seen = new Set(mapped.map((item) => `${item.entityType}:${item.entityId}`));
    const snapshot = this.snapshotActivity(context.jobs, context.vehicles, context.drivers)
      .filter((item) => !seen.has(`${item.entityType}:${item.entityId}`));

    return [...mapped, ...snapshot].slice(0, ACTIVITY_LIMIT);
  }

  private describeActivity(
    entry: OverviewAuditEntry,
    jobById: Map<string, DispatchJob>,
    vehicleById: Map<string, OverviewVehicle>,
    driverById: Map<string, OverviewDriver>,
  ): ActivityItem {
    const job = jobById.get(entry.entityId);
    if (job) {
      const status = this.entryStatus(entry) ?? job.status;
      return this.activityItem(entry, `Job ${this.statusLabel(status)}`, this.route(job.pickupAddress, job.dropoffAddress));
    }

    const vehicle = vehicleById.get(entry.entityId);
    if (vehicle) {
      return this.activityItem(
        entry,
        `${vehicle.plateNumber} is ${this.statusLabel(vehicle.status)}`,
        [vehicle.make, vehicle.model].filter(Boolean).join(" ") || null,
      );
    }

    const driver = driverById.get(entry.entityId);
    if (driver) {
      return this.activityItem(
        entry,
        `${driver.name} is ${this.statusLabel(driver.status)}`,
        driver.phone ?? "Driver account",
      );
    }

    if (entry.entityType === "alert") {
      return this.activityItem(entry, "Fleet alert triggered", "Review the alert for details");
    }

    return this.activityItem(entry, this.actionLabel(entry.action), null);
  }

  private snapshotActivity(
    jobs: DispatchJob[],
    vehicles: OverviewVehicle[],
    drivers: OverviewDriver[],
  ): ActivityItem[] {
    const now = new Date().toISOString();
    const jobItems = [...jobs]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .map((job) => ({
        id: `job-${job.id}`,
        action: `status.${job.status}`,
        entityType: "job",
        entityId: job.id,
        summary: `Job ${this.statusLabel(job.status)}`,
        occurredAt: job.updatedAt || job.createdAt,
        title: `Job ${this.statusLabel(job.status)}`,
        description: this.route(job.pickupAddress, job.dropoffAddress),
      }));
    const vehicleItems = [...vehicles]
      .sort((a, b) => Date.parse(b.createdAt ?? now) - Date.parse(a.createdAt ?? now))
      .map((vehicle) => ({
        id: `vehicle-${vehicle.id}`,
        action: `vehicle.status.${vehicle.status}`,
        entityType: "vehicle",
        entityId: vehicle.id,
        summary: `${vehicle.plateNumber} is ${this.statusLabel(vehicle.status)}`,
        occurredAt: vehicle.createdAt ?? now,
        title: `${vehicle.plateNumber} is ${this.statusLabel(vehicle.status)}`,
        description: [vehicle.make, vehicle.model].filter(Boolean).join(" ") || null,
      }));
    const driverItems = [...drivers]
      .sort((a, b) => Date.parse(b.updatedAt ?? now) - Date.parse(a.updatedAt ?? now))
      .map((driver) => ({
        id: `driver-${driver.id}`,
        action: `driver.status.${driver.status}`,
        entityType: "driver",
        entityId: driver.id,
        summary: `${driver.name} is ${this.statusLabel(driver.status)}`,
        occurredAt: driver.updatedAt ?? driver.createdAt ?? now,
        title: `${driver.name} is ${this.statusLabel(driver.status)}`,
        description: driver.phone ?? "Driver account",
      }));

    return [...jobItems, ...vehicleItems, ...driverItems];
  }

  private activityItem(entry: OverviewAuditEntry, title: string, description: string | null): ActivityItem {
    return {
      id: entry.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: title,
      occurredAt: entry.occurredAt,
      title,
      description,
    };
  }

  private entryStatus(entry: OverviewAuditEntry): string | null {
    for (const key of ["newStatus", "status"]) {
      const value = entry.metadata?.[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    if (entry.action.startsWith("status.changed.")) {
      return entry.action.slice("status.changed.".length) || null;
    }
    return null;
  }

  private statusLabel(status: string): string {
    return status.replace(/[_-]+/g, " ").trim().toLowerCase() || "updated";
  }

  private actionLabel(action: string): string {
    const last = action.split(".").filter(Boolean).pop() ?? action;
    return this.statusLabel(last).replace(/^\w/, (letter) => letter.toUpperCase());
  }

  private route(pickup: string | null, dropoff: string | null): string | null {
    const from = this.place(pickup);
    const to = this.place(dropoff);
    if (from && to) return `${from} → ${to}`;
    return from ?? to ?? null;
  }

  private place(address: string | null): string | null {
    return address?.split(",")[0]?.trim() || null;
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
