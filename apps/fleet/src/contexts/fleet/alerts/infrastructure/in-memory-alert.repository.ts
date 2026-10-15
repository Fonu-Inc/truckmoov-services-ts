import { Injectable } from "@nestjs/common";
import { Alert } from "../domain/alert.entity";
import type { AlertCount, AlertFilters, AlertRepository } from "../domain/alert.repository";

@Injectable()
export class InMemoryAlertRepository implements AlertRepository {
  private readonly store = new Map<string, Alert>();

  private key(tenantId: string, id: string) {
    return `${tenantId}:${id}`;
  }

  async save(alert: Alert): Promise<void> {
    this.store.set(this.key(alert.tenantId, alert.id), alert);
  }

  async findById(tenantId: string, id: string): Promise<Alert | null> {
    return this.store.get(this.key(tenantId, id)) ?? null;
  }

  async findAll(tenantId: string, filters?: AlertFilters): Promise<Alert[]> {
    return Array.from(this.store.values())
      .filter((a) => {
        if (a.tenantId !== tenantId) return false;
        if (filters?.status && a.status !== filters.status) return false;
        if (filters?.type && a.type !== filters.type) return false;
        if (filters?.vehicleId && a.vehicleId !== filters.vehicleId) return false;
        if (filters?.vehicleIdIn && !filters.vehicleIdIn.includes(a.vehicleId ?? "")) return false;
        if (filters?.jobId && a.jobId !== filters.jobId) return false;
        return true;
      })
      .sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime())
      .slice(0, filters?.limit);
  }

  async countBy(tenantId: string): Promise<AlertCount[]> {
    const counts = new Map<string, AlertCount>();
    for (const a of this.store.values()) {
      if (a.tenantId !== tenantId) continue;
      const key = `${a.status}|${a.type}|${a.severity}`;
      const entry = counts.get(key) ?? { status: a.status, type: a.type, severity: a.severity, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
    return [...counts.values()];
  }

  async meanTimeToResolveMs(tenantId: string): Promise<number | null> {
    const durations = Array.from(this.store.values())
      .filter((a) => a.tenantId === tenantId && a.resolvedAt)
      .map((a) => a.resolvedAt!.getTime() - a.triggeredAt.getTime());
    return durations.length ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length : null;
  }

  async findOpenTriggeredBefore(cutoff: Date, limit: number): Promise<Alert[]> {
    return Array.from(this.store.values())
      .filter((a) => a.status === "open" && a.triggeredAt.getTime() < cutoff.getTime())
      .sort((a, b) => a.triggeredAt.getTime() - b.triggeredAt.getTime())
      .slice(0, limit);
  }

  async escalateIfOpen(tenantId: string, id: string, at: Date): Promise<boolean> {
    const alert = this.store.get(this.key(tenantId, id));
    if (alert?.status !== "open") return false;
    this.store.set(this.key(tenantId, id), alert.escalate(at));
    return true;
  }
}
