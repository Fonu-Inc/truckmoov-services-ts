import { Injectable } from "@nestjs/common";
import type {
  StoredZoneOccupancy,
  ZoneOccupancyRepository,
  ZoneOccupantCount,
} from "../domain/zone-occupancy.repository";

@Injectable()
export class InMemoryZoneOccupancyRepository implements ZoneOccupancyRepository {
  private readonly store = new Map<string, StoredZoneOccupancy>();

  async findByVehicle(tenantId: string, vehicleId: string): Promise<StoredZoneOccupancy[]> {
    return [...this.store.values()].filter(
      (entry) => entry.tenantId === tenantId && entry.vehicleId === vehicleId,
    );
  }

  async enter(occupancy: StoredZoneOccupancy): Promise<void> {
    const key = this.keyFor(occupancy.tenantId, occupancy.vehicleId, occupancy.zoneId);
    if (this.store.has(key)) return;
    this.store.set(key, { ...occupancy });
  }

  async exit(tenantId: string, vehicleId: string, zoneIds: string[]): Promise<void> {
    for (const zoneId of zoneIds) this.store.delete(this.keyFor(tenantId, vehicleId, zoneId));
  }

  async markDwellNotified(
    tenantId: string,
    vehicleId: string,
    zoneId: string,
    at: Date,
  ): Promise<void> {
    const entry = this.store.get(this.keyFor(tenantId, vehicleId, zoneId));
    if (entry) entry.dwellNotifiedAt = at;
  }

  async claimSpeedingAlert(
    tenantId: string,
    vehicleId: string,
    zoneId: string,
    at: Date,
  ): Promise<boolean> {
    const entry = this.store.get(this.keyFor(tenantId, vehicleId, zoneId));
    if (!entry || entry.speedingNotifiedAt) return false;
    entry.speedingNotifiedAt = at;
    return true;
  }

  /** Needs zone shapes and shared positions, which only the database backend has. */
  async syncZone(): Promise<void> {}

  async countByZone(tenantId: string): Promise<ZoneOccupantCount[]> {
    const counts = new Map<string, number>();
    for (const entry of this.store.values()) {
      if (entry.tenantId !== tenantId) continue;
      counts.set(entry.zoneId, (counts.get(entry.zoneId) ?? 0) + 1);
    }
    return [...counts.entries()].map(([zoneId, vehicles]) => ({ zoneId, vehicles }));
  }

  async listOccupants(tenantId: string, zoneId: string): Promise<StoredZoneOccupancy[]> {
    return [...this.store.values()]
      .filter((entry) => entry.tenantId === tenantId && entry.zoneId === zoneId)
      .sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
  }

  async findPendingDwell(olderThan: Date, limit: number): Promise<StoredZoneOccupancy[]> {
    return [...this.store.values()]
      .filter((entry) => entry.dwellNotifiedAt === null && entry.enteredAt <= olderThan)
      .sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime())
      .slice(0, limit);
  }

  private keyFor(tenantId: string, vehicleId: string, zoneId: string): string {
    return `${tenantId}:${vehicleId}:${zoneId}`;
  }
}
