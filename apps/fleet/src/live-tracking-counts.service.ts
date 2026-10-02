import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppConfigService } from "@shared/config";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import {
  DISPATCH_JOBS_READER,
  type DispatchJobsReader,
} from "./contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";
import {
  VEHICLE_POSITIONS_READER,
  type VehiclePositionsReader,
} from "./contexts/fleet/reports/domain/ports/vehicle-positions-reader.port";
import { activeJobByVehicle } from "./contexts/fleet/tracking/domain/active-jobs";
import {
  countLiveStatuses,
  liveCountsEqual,
  liveStatusFor,
  type LiveStatusCounts,
  type LiveVehicleStatus,
} from "./contexts/fleet/tracking/domain/live-status";

const ACTIVE_JOBS_REFRESH_MS = 30_000;

type TrackedVehicle = {
  tenantId: string;
  lastFixAt: string | null;
  speedKph: number | null;
  hasActiveJob: boolean;
  status: LiveVehicleStatus;
};

/**
 * Keeps the bottom status bar honest.
 *
 * The counts are computed here rather than in the browser so the bar and the
 * vehicle list cannot disagree, and published only when the tally actually
 * changes — a fleet reporting every five seconds changes position constantly
 * and changes bucket rarely.
 *
 * A vehicle going offline is the case that needs the sweep: nothing arrives to
 * trigger the check when a device stops reporting, which is exactly when the
 * bar most needs to move.
 */
@Injectable()
export class LiveTrackingCountsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LiveTrackingCountsService.name);
  private readonly vehicles = new Map<string, TrackedVehicle>();
  private readonly published = new Map<string, LiveStatusCounts>();
  private readonly jobsRefreshedAt = new Map<string, number>();
  private readonly jobsRefreshing = new Set<string>();
  private sweep: NodeJS.Timeout | null = null;

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleList: VehicleRepository,
    @Inject(VEHICLE_POSITIONS_READER) private readonly positions: VehiclePositionsReader,
  ) {}

  onApplicationBootstrap(): void {
    const interval = this.config.liveTracking.sweepIntervalSeconds * 1000;
    this.sweep = setInterval(() => this.recheckAll(), interval);
    // Never hold the process open for a counter refresh.
    this.sweep.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.sweep) clearInterval(this.sweep);
    this.sweep = null;
  }

  record(input: {
    tenantId: string;
    vehicleId: string;
    fixedAt: string;
    speedKph: number | null;
  }): void {
    const key = this.keyFor(input.tenantId, input.vehicleId);
    const current = this.vehicles.get(key);

    this.vehicles.set(key, {
      tenantId: input.tenantId,
      lastFixAt: input.fixedAt,
      speedKph: input.speedKph,
      // Job assignment is not carried on a position. It is refreshed by
      // setActiveJobs and otherwise held, so a fix does not silently move a
      // working vehicle out of "in progress".
      hasActiveJob: current?.hasActiveJob ?? false,
      status: current?.status ?? "offline",
    });

    this.recheckTenant(input.tenantId);
    void this.refreshActiveJobs(input.tenantId);
  }

  /**
   * Pulls the tenant's real jobs from dispatch, at most every 30 seconds, so
   * vehicles on a job count as in progress instead of always reading zero.
   */
  async refreshActiveJobs(tenantId: string): Promise<void> {
    const last = this.jobsRefreshedAt.get(tenantId) ?? 0;
    if (this.jobsRefreshing.has(tenantId) || Date.now() - last < ACTIVE_JOBS_REFRESH_MS) return;
    this.jobsRefreshing.add(tenantId);
    await this.seedVehicles(tenantId);
    try {
      const jobs = await this.dispatchJobs.listJobs(tenantId);
      this.jobsRefreshedAt.set(tenantId, Date.now());
      this.setActiveJobs(tenantId, new Set(activeJobByVehicle(jobs).keys()));
    } catch (error) {
      this.logger.warn(
        `tracking_counts_jobs_refresh_failed:${tenantId}:${error instanceof Error ? error.message : "unknown"}`,
      );
    } finally {
      this.jobsRefreshing.delete(tenantId);
    }
  }

  /**
   * Adds the tenant's registered vehicles it has not heard from since starting,
   * from their latest stored positions so a restart does not read as offline,
   * and drops never-reported ones that no longer exist.
   */
  private async seedVehicles(tenantId: string): Promise<void> {
    try {
      const ids = new Set(await this.vehicleList.listIdsByTenant(tenantId));
      const unseen = [...ids].filter((id) => !this.vehicles.has(this.keyFor(tenantId, id)));
      if (unseen.length > 0) await this.seedUnseen(tenantId, unseen);
      this.dropRemovedVehicles(tenantId, ids);
    } catch (error) {
      this.logger.warn(
        `tracking_counts_vehicles_seed_failed:${tenantId}:${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  private async seedUnseen(tenantId: string, ids: string[]): Promise<void> {
    const latest = await this.positions.listLatestPositions(tenantId);
    const byVehicle = new Map(latest.map((position) => [String(position.vehicleId), position]));
    for (const id of ids) {
      const position = byVehicle.get(id);
      const fixedAt = position && Number.isNaN(Date.parse(position.recordedAt)) ? null : (position?.recordedAt ?? null);
      this.vehicles.set(this.keyFor(tenantId, id), {
        tenantId,
        lastFixAt: fixedAt,
        speedKph: fixedAt && typeof position?.speedKph === "number" ? position.speedKph : null,
        hasActiveJob: false,
        status: "offline",
      });
    }
  }

  private dropRemovedVehicles(tenantId: string, registeredIds: Set<string>): void {
    for (const [key, tracked] of this.vehicles) {
      if (tracked.tenantId !== tenantId || tracked.lastFixAt !== null) continue;
      if (!registeredIds.has(key.slice(tenantId.length + 1))) this.vehicles.delete(key);
    }
  }

  /** Called when dispatch job assignments are refreshed for a tenant. */
  setActiveJobs(tenantId: string, vehicleIdsOnJobs: Set<string>): void {
    for (const [key, tracked] of this.vehicles) {
      if (tracked.tenantId !== tenantId) continue;
      const vehicleId = key.slice(tenantId.length + 1);
      tracked.hasActiveJob = vehicleIdsOnJobs.has(vehicleId);
    }
    this.recheckTenant(tenantId);
  }

  countsFor(tenantId: string): LiveStatusCounts {
    return countLiveStatuses(this.statusesFor(tenantId));
  }

  private recheckAll(): void {
    const tenants = new Set([...this.vehicles.values()].map((tracked) => tracked.tenantId));
    for (const tenantId of tenants) {
      this.recheckTenant(tenantId);
      void this.refreshActiveJobs(tenantId);
    }
  }

  private recheckTenant(tenantId: string): void {
    const counts = this.countsFor(tenantId);
    const previous = this.published.get(tenantId);
    if (previous && liveCountsEqual(previous, counts)) return;

    this.published.set(tenantId, counts);
    void this.publish(tenantId, counts);
  }

  private statusesFor(tenantId: string): LiveVehicleStatus[] {
    const offlineAfterMs = this.config.liveTracking.offlineAfterMinutes * 60 * 1000;
    const now = Date.now();

    return [...this.vehicles.values()]
      .filter((tracked) => tracked.tenantId === tenantId)
      .map((tracked) => {
        tracked.status = liveStatusFor(tracked, offlineAfterMs, now);
        return tracked.status;
      });
  }

  private async publish(tenantId: string, counts: LiveStatusCounts): Promise<void> {
    try {
      await this.bus.publish(`tm.${tenantId}.tracking.counts`, {
        id: randomUUID(),
        type: "tracking.counts",
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: tenantId,
        data: counts,
      });
    } catch (error) {
      // A missed counter refresh is not worth failing ingest over; the next
      // change republishes, and the snapshot endpoint is authoritative anyway.
      this.logger.warn(
        `tracking_counts_publish_failed:${tenantId}:${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  private keyFor(tenantId: string, vehicleId: string): string {
    return `${tenantId}:${vehicleId}`;
  }
}
