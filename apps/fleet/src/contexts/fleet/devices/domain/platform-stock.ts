import type { Device } from "./entities/device.entity";

const UNHEALTHY_LIFECYCLE: readonly string[] = ["faulty", "suspended", "decommissioned"];

type StockCandidate = Pick<Device, "id" | "lifecycleStatus" | "vehicleId" | "holdCause" | "createdAt">;

export function isHealthyStock(device: StockCandidate): boolean {
  return !device.vehicleId && !device.holdCause && !UNHEALTHY_LIFECYCLE.includes(device.lifecycleStatus);
}

/** Healthy platform-held devices, oldest first. */
export function orderPlatformStock<T extends StockCandidate>(devices: T[]): T[] {
  return devices
    .filter(isHealthyStock)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Devices still to move for a tenant to hold `target`, given what it already holds. */
export function devicesStillNeeded(target: number, held: number): number {
  return Math.max(0, target - held);
}
