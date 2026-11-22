import type { DispatchJob } from "../../dispatch/domain/ports/dispatch-jobs-reader.port";

export type DriverSafetyScore = {
  driverId: string;
  driverName: string;
  incidents: number;
  harshBraking: number;
  overspeeding: number;
  /** Null when no event was recorded against the driver in the period. */
  safetyScore: number | null;
};

/** Every driver assigned to a vehicle, scored from the alerts raised on that vehicle; best first, unscored last. */
export function scoreDrivers(
  vehicles: Array<{ id: string; assignedDriverId: string | null }>,
  drivers: Array<{ id: string; name: string }>,
  alerts: Array<{ vehicleId: string | null; type: string }>,
): DriverSafetyScore[] {
  const driverNames = new Map(drivers.map((d) => [d.id, d.name]));
  const vehicleToDriver = new Map<string, string>();
  const scores = new Map<string, Omit<DriverSafetyScore, "safetyScore">>();
  for (const v of vehicles) {
    if (!v.assignedDriverId || !driverNames.has(v.assignedDriverId)) continue;
    vehicleToDriver.set(v.id, v.assignedDriverId);
    scores.set(v.assignedDriverId, {
      driverId: v.assignedDriverId,
      driverName: driverNames.get(v.assignedDriverId)!,
      incidents: 0,
      harshBraking: 0,
      overspeeding: 0,
    });
  }
  for (const alert of alerts) {
    const entry = alert.vehicleId ? scores.get(vehicleToDriver.get(alert.vehicleId) ?? "") : undefined;
    if (!entry) continue;
    entry.incidents++;
    if (alert.type.includes("harsh_braking")) entry.harshBraking++;
    if (alert.type.includes("overspeeding") || alert.type.includes("speeding")) entry.overspeeding++;
  }
  return [...scores.values()]
    .map((s) => ({ ...s, safetyScore: s.incidents > 0 ? Math.max(0, 100 - s.incidents * 2) : null }))
    .sort((a, b) => (b.safetyScore ?? -1) - (a.safetyScore ?? -1));
}

export function fleetSafetyScore(scores: DriverSafetyScore[]): number | null {
  const scored = scores.flatMap((s) => (s.safetyScore === null ? [] : [s.safetyScore]));
  return scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + s, 0) / scored.length) : null;
}

/** Same rule as profit and loss: delivered jobs on the given vehicles, dated by delivery. */
export function deliveredRevenue(jobs: DispatchJob[], vehicleIds: ReadonlySet<string>, since: Date): number {
  const total = jobs
    .filter((j) => j.status === "delivered" && j.assignedVehicleId !== null && vehicleIds.has(j.assignedVehicleId))
    .filter((j) => new Date(j.deliveredAt ?? j.updatedAt) >= since)
    .reduce((sum, j) => sum + (j.amountNgn ?? 0), 0);
  return Math.round(total * 100) / 100;
}
