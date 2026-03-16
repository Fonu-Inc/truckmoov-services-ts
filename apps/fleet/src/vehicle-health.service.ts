import { Injectable } from "@nestjs/common";

type HealthEntry = { lastSeen: number; deviceId: string | null };

@Injectable()
export class VehicleHealthService {
  private readonly store = new Map<string, HealthEntry>();

  touch(vehicleId: string, timestamp = Date.now(), deviceId: string | null = null) {
    this.store.set(vehicleId, { lastSeen: timestamp, deviceId });
  }

  get(vehicleId: string): HealthEntry | null {
    return this.store.get(vehicleId) ?? null;
  }

  list(): Array<{ vehicleId: string } & HealthEntry> {
    return Array.from(this.store.entries()).map(([vehicleId, entry]) => ({ vehicleId, ...entry }));
  }
}
