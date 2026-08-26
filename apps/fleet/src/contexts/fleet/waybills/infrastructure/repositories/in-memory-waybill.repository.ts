import { Injectable } from "@nestjs/common";
import {
  WAYBILL_STATUSES,
  type Waybill,
  type WaybillStatus,
} from "../../domain/entities/waybill.entity";
import type {
  WaybillFilters,
  WaybillPage,
  WaybillRepository,
} from "../../domain/repositories/waybill.repository";

@Injectable()
export class InMemoryWaybillRepository implements WaybillRepository {
  private readonly data = new Map<string, Waybill>();

  async save(waybill: Waybill): Promise<void> {
    this.data.set(waybill.id, waybill);
  }

  async findById(id: string, tenantId: string): Promise<Waybill | null> {
    const waybill = this.data.get(id);
    if (!waybill || waybill.tenantId !== tenantId) return null;
    return waybill;
  }

  async findByNumber(waybillNumber: string, tenantId: string): Promise<Waybill | null> {
    const wanted = waybillNumber.trim().toLowerCase();
    return (
      [...this.data.values()].find(
        (waybill) =>
          waybill.tenantId === tenantId
          && (waybill.waybillNumber ?? "").toLowerCase() === wanted,
      ) ?? null
    );
  }

  async search(filters: WaybillFilters): Promise<WaybillPage> {
    const matched = [...this.data.values()]
      .filter((waybill) => this.matches(waybill, filters))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? matched.length;
    return { items: matched.slice(offset, offset + limit), total: matched.length };
  }

  async countByStatus(tenantId: string): Promise<Record<WaybillStatus, number>> {
    const counts = Object.fromEntries(
      WAYBILL_STATUSES.map((status) => [status, 0]),
    ) as Record<WaybillStatus, number>;

    for (const waybill of this.data.values()) {
      if (waybill.tenantId !== tenantId) continue;
      counts[waybill.status] += 1;
    }
    return counts;
  }

  async findPendingCapturedBefore(cutoff: Date, limit: number): Promise<Waybill[]> {
    return [...this.data.values()]
      .filter(
        (waybill) =>
          waybill.status === "pending" && Date.parse(waybill.createdAt) <= cutoff.getTime(),
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit);
  }

  private matches(waybill: Waybill, filters: WaybillFilters): boolean {
    if (waybill.tenantId !== filters.tenantId) return false;
    if (filters.status && waybill.status !== filters.status) return false;
    if (
      filters.customerName
      && (waybill.customerName ?? "").toLowerCase() !== filters.customerName.toLowerCase()
    ) {
      return false;
    }
    if (filters.dateFrom && (waybill.waybillDate ?? "") < filters.dateFrom) return false;
    if (filters.dateTo && (waybill.waybillDate ?? "") > filters.dateTo) return false;

    const query = filters.query?.trim().toLowerCase();
    if (!query) return true;
    return [
      waybill.waybillNumber,
      waybill.destination,
      waybill.vehicleRegistration,
      waybill.customerName,
    ].some((value) => (value ?? "").toLowerCase().includes(query));
  }
}
