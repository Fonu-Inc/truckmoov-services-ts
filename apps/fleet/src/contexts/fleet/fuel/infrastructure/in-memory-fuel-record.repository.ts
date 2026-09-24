import { Injectable } from "@nestjs/common";
import { FuelRecord } from "../domain/entities/fuel-record.entity";
import type { FuelRecordFilters, FuelRecordRepository } from "../domain/repositories/fuel-record.repository";
import { inclusiveEnd } from "../../../../utils/date-window";

@Injectable()
export class InMemoryFuelRecordRepository implements FuelRecordRepository {
  private readonly store = new Map<string, FuelRecord>();

  async save(record: FuelRecord): Promise<void> {
    this.store.set(record.id, record);
  }

  async findById(id: string, tenantId: string): Promise<FuelRecord | null> {
    const record = this.store.get(id);
    if (!record || record.tenantId !== tenantId) return null;
    return record;
  }

  async findAll(filters?: FuelRecordFilters): Promise<FuelRecord[]> {
    let records = [...this.store.values()];

    if (!filters?.includeDeleted) records = records.filter((r) => !r.isDeleted);
    if (filters?.tenantId) records = records.filter((r) => r.tenantId === filters.tenantId);
    if (filters?.vehicleId) records = records.filter((r) => r.vehicleId === filters.vehicleId);
    if (filters?.driverId) records = records.filter((r) => r.driverId === filters.driverId);
    if (filters?.station) {
      const q = filters.station.toLowerCase();
      records = records.filter((r) => r.station?.toLowerCase().includes(q));
    }
    if (filters?.from) records = records.filter((r) => r.recordedAt >= filters.from!);
    const to = inclusiveEnd(filters?.to);
    if (to) records = records.filter((r) => r.recordedAt <= to);

    return records.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  }
}
