import { Injectable } from "@nestjs/common";

type HealthEntry = { lastSeen: number; deviceId: string | null; lat: number | null; lng: number | null };

@Injectable()
export class VehicleHealthService {
  private readonly store = new Map<string, HealthEntry>();

  touch(vehicleId: string, timestamp = Date.now(), deviceId: string | null = null, lat: number | null = null, lng: number | null = null) {
    this.store.set(vehicleId, { lastSeen: timestamp, deviceId, lat, lng });
  }

  get(vehicleId: string): HealthEntry | null {
    return this.store.get(vehicleId) ?? null;
  }

  list(): Array<{ vehicleId: string } & HealthEntry> {
    return Array.from(this.store.entries()).map(([vehicleId, entry]) => ({ vehicleId, ...entry }));
  }
}
