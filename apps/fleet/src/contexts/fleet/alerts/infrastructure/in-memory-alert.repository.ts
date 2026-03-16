import { Injectable } from "@nestjs/common";
import { Alert } from "../domain/alert.entity";
import type { AlertFilters, AlertRepository } from "../domain/alert.repository";

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
    return Array.from(this.store.values()).filter((a) => {
      if (a.tenantId !== tenantId) return false;
      if (filters?.status && a.status !== filters.status) return false;
      if (filters?.type && a.type !== filters.type) return false;
      if (filters?.vehicleId && a.vehicleId !== filters.vehicleId) return false;
      if (filters?.jobId && a.jobId !== filters.jobId) return false;
      return true;
    });
  }
}
