import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  DriverBehaviorEventRecord,
  DriverFatigueAnalysisRecord,
  GeofenceAlertReadRecord,
  getFleetOrm,
} from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import type {
  BehaviorEventFilters,
  BehaviorEventRepository,
  StoredBehaviorEvent,
} from "./contexts/fleet/drivers/domain/driver-behavior";
import type {
  FatigueAnalysisRepository,
  StoredFatigueAnalysis,
} from "./contexts/fleet/drivers/domain/driver-fatigue";
import type {
  GeofenceAlertReadRepository,
  StoredGeofenceAlertRead,
} from "./contexts/fleet/drivers/domain/geofence-alert-read.repository";

function toEvent(record: DriverBehaviorEventRecord): StoredBehaviorEvent {
  return {
    id: record.id,
    tenantId: record.tenantId,
    driverId: record.driverId,
    vehicleId: record.vehicleId ?? null,
    type: record.type as StoredBehaviorEvent["type"],
    severity: record.severity as StoredBehaviorEvent["severity"],
    speedKph: record.speedKph ?? null,
    latitude: record.latitude ?? null,
    longitude: record.longitude ?? null,
    occurredAt: record.occurredAt,
    createdAt: record.createdAt,
  };
}

@Injectable()
export class MikroBehaviorEventRepository implements BehaviorEventRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(event: StoredBehaviorEvent): Promise<void> {
    const em = await this.em();
    const record = new DriverBehaviorEventRecord();
    Object.assign(record, event);
    em.persist(record);
    await em.flush();
  }

  async findAll(tenantId: string, filters?: BehaviorEventFilters): Promise<StoredBehaviorEvent[]> {
    const em = await this.em();
    const where: Record<string, unknown> = { tenantId };
    if (filters?.driverId) where.driverId = filters.driverId;
    if (filters?.type) where.type = filters.type;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.since) where.occurredAt = { $gte: filters.since };

    const records = await em.find(DriverBehaviorEventRecord, where, {
      orderBy: { occurredAt: "desc" },
      limit: filters?.limit ?? 500,
    });
    return records.map(toEvent);
  }

  private async em() {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork();
  }
}

@Injectable()
export class MikroFatigueAnalysisRepository implements FatigueAnalysisRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(analysis: StoredFatigueAnalysis): Promise<void> {
    const em = await this.em();
    const record = new DriverFatigueAnalysisRecord();
    Object.assign(record, analysis);
    em.persist(record);
    await em.flush();
  }

  async findLatestForDriver(tenantId: string, driverId: string): Promise<StoredFatigueAnalysis | null> {
    const em = await this.em();
    const record = await em.findOne(
      DriverFatigueAnalysisRecord,
      { tenantId, driverId },
      { orderBy: { analyzedAt: "desc" } },
    );
    return record ? toAnalysis(record) : null;
  }

  async findHistoryForDriver(
    tenantId: string,
    driverId: string,
    limit: number,
  ): Promise<StoredFatigueAnalysis[]> {
    const em = await this.em();
    const records = await em.find(
      DriverFatigueAnalysisRecord,
      { tenantId, driverId },
      { orderBy: { analyzedAt: "desc" }, limit },
    );
    return records.map(toAnalysis);
  }

  async findLatestPerDriver(tenantId: string): Promise<StoredFatigueAnalysis[]> {
    const em = await this.em();
    const records = await em.find(
      DriverFatigueAnalysisRecord,
      { tenantId },
      { orderBy: { analyzedAt: "desc" }, limit: 500 },
    );

    const latest = new Map<string, StoredFatigueAnalysis>();
    for (const record of records) {
      if (!latest.has(record.driverId)) latest.set(record.driverId, toAnalysis(record));
    }
    return [...latest.values()];
  }

  private async em() {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork();
  }
}

function toAnalysis(record: DriverFatigueAnalysisRecord): StoredFatigueAnalysis {
  return {
    id: record.id,
    tenantId: record.tenantId,
    driverId: record.driverId,
    score: record.score,
    riskLevel: record.riskLevel as StoredFatigueAnalysis["riskLevel"],
    drivingMinutes: record.drivingMinutes,
    restCompliance: record.restCompliance ?? null,
    indicators: (record.indicators ?? []) as string[],
    recommendations: (record.recommendations ?? []) as string[],
    analysis: record.analysis,
    dataQuality: record.dataQuality as StoredFatigueAnalysis["dataQuality"],
    analyzedAt: record.analyzedAt,
  };
}

@Injectable()
export class MikroGeofenceAlertReadRepository implements GeofenceAlertReadRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async markRead(reads: StoredGeofenceAlertRead[]): Promise<void> {
    if (reads.length === 0) return;
    const em = await this.em();
    for (const read of reads) {
      const existing = await em.findOne(GeofenceAlertReadRecord, {
        tenantId: read.tenantId,
        alertId: read.alertId,
        readBy: read.readBy,
      });
      if (existing) continue;
      const record = new GeofenceAlertReadRecord();
      Object.assign(record, read);
      em.persist(record);
    }
    await em.flush();
  }

  async findReadAlertIds(tenantId: string, readBy: string): Promise<string[]> {
    const em = await this.em();
    const records = await em.find(GeofenceAlertReadRecord, { tenantId, readBy });
    return records.map((record) => record.alertId);
  }

  private async em() {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork();
  }
}
