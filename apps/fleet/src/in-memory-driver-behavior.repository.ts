import { Injectable } from "@nestjs/common";
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

@Injectable()
export class InMemoryBehaviorEventRepository implements BehaviorEventRepository {
  private readonly events: StoredBehaviorEvent[] = [];

  async save(event: StoredBehaviorEvent): Promise<void> {
    this.events.push({ ...event });
  }

  async findAll(tenantId: string, filters?: BehaviorEventFilters): Promise<StoredBehaviorEvent[]> {
    return this.events
      .filter((event) => {
        if (event.tenantId !== tenantId) return false;
        if (filters?.driverId && event.driverId !== filters.driverId) return false;
        if (filters?.type && event.type !== filters.type) return false;
        if (filters?.severity && event.severity !== filters.severity) return false;
        if (filters?.since && event.occurredAt < filters.since) return false;
        return true;
      })
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, filters?.limit === null ? undefined : (filters?.limit ?? 500));
  }
}

@Injectable()
export class InMemoryFatigueAnalysisRepository implements FatigueAnalysisRepository {
  private readonly analyses: StoredFatigueAnalysis[] = [];

  async save(analysis: StoredFatigueAnalysis): Promise<void> {
    this.analyses.push({ ...analysis });
  }

  async findLatestForDriver(tenantId: string, driverId: string): Promise<StoredFatigueAnalysis | null> {
    return this.sorted(tenantId).find((analysis) => analysis.driverId === driverId) ?? null;
  }

  async findHistoryForDriver(
    tenantId: string,
    driverId: string,
    limit: number,
  ): Promise<StoredFatigueAnalysis[]> {
    return this.sorted(tenantId)
      .filter((analysis) => analysis.driverId === driverId)
      .slice(0, limit);
  }

  async findLatestPerDriver(tenantId: string): Promise<StoredFatigueAnalysis[]> {
    const latest = new Map<string, StoredFatigueAnalysis>();
    for (const analysis of this.sorted(tenantId)) {
      if (!latest.has(analysis.driverId)) latest.set(analysis.driverId, analysis);
    }
    return [...latest.values()];
  }

  private sorted(tenantId: string): StoredFatigueAnalysis[] {
    return this.analyses
      .filter((analysis) => analysis.tenantId === tenantId)
      .sort((a, b) => b.analyzedAt.getTime() - a.analyzedAt.getTime());
  }
}

@Injectable()
export class InMemoryGeofenceAlertReadRepository implements GeofenceAlertReadRepository {
  private readonly reads: StoredGeofenceAlertRead[] = [];

  async markRead(reads: StoredGeofenceAlertRead[]): Promise<void> {
    for (const read of reads) {
      const seen = this.reads.some(
        (entry) =>
          entry.tenantId === read.tenantId &&
          entry.alertId === read.alertId &&
          entry.readBy === read.readBy,
      );
      if (!seen) this.reads.push({ ...read });
    }
  }

  async findReadAlertIds(tenantId: string, readBy: string): Promise<string[]> {
    return this.reads
      .filter((read) => read.tenantId === tenantId && read.readBy === readBy)
      .map((read) => read.alertId);
  }
}
