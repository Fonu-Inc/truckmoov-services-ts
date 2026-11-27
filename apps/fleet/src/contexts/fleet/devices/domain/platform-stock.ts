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

/** Claims up to `needed` devices in concurrent batches, in stock order; a lost claim is topped up from the devices after it. */
export async function claimFromStock<T extends { id: string }>(
  stock: T[],
  needed: number,
  claim: (device: T) => Promise<boolean>,
): Promise<string[]> {
  const claimed: string[] = [];
  for (let next = 0; claimed.length < needed && next < stock.length; ) {
    const batch = stock.slice(next, next + needed - claimed.length);
    next += batch.length;
    const won = await Promise.all(batch.map(claim));
    batch.forEach((device, i) => won[i] && claimed.push(device.id));
  }
  return claimed;
}
