import type { DispatchJob } from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import type { FuelRecordProps } from "../../fuel/domain/entities/fuel-record.entity";
import type { AnalyticsRange } from "./analytics-range";

export type FuelReportVehicle = { id: string; plateNumber: string; make: string | null; model: string; type: string | null; fuelType: string | null };

export type FuelReportRow = {
  vehicleId: string;
  plateNumber: string;
  name: string;
  vehicleType: string | null;
  fuelType: string | null;
  fillUps: number;
  litres: number;
  costNgn: number;
  distanceKm: number | null;
  efficiencyKmPerLitre: number | null;
  trips: number;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function mostCommon(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Distance is the odometer movement between the first and last fill in the
 * window. The litres that bought that distance are every fill after the first,
 * since the first fill only topped up what was burned before it.
 */
function odometerFigures(records: FuelRecordProps[]): { distanceKm: number | null; litresForDistance: number } {
  const readings = records
    .filter((record) => record.odometer !== null && record.odometer !== undefined)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  if (readings.length < 2) return { distanceKm: null, litresForDistance: 0 };

  const distanceKm = Math.max(0, readings[readings.length - 1].odometer! - readings[0].odometer!);
  const litresForDistance = readings.slice(1).reduce((sum, record) => sum + record.liters, 0);
  return { distanceKm, litresForDistance };
}

export function buildFuelRows(
  vehicles: FuelReportVehicle[],
  records: FuelRecordProps[],
  jobs: DispatchJob[],
  range: AnalyticsRange,
): { rows: FuelReportRow[]; litresForDistance: Map<string, number> } {
  const recordsByVehicle = new Map<string, FuelRecordProps[]>();
  for (const record of records) {
    recordsByVehicle.set(record.vehicleId, [...(recordsByVehicle.get(record.vehicleId) ?? []), record]);
  }
  const deliveredByVehicle = new Map<string, number>();
  for (const job of jobs) {
    if (job.status !== "delivered" || !job.assignedVehicleId) continue;
    if (job.updatedAt < range.from || job.updatedAt > range.to) continue;
    deliveredByVehicle.set(job.assignedVehicleId, (deliveredByVehicle.get(job.assignedVehicleId) ?? 0) + 1);
  }

  const litresForDistance = new Map<string, number>();
  const rows = vehicles.flatMap((vehicle): FuelReportRow[] => {
    const own = recordsByVehicle.get(vehicle.id) ?? [];
    if (own.length === 0) return [];
    const odometer = odometerFigures(own);
    litresForDistance.set(vehicle.id, odometer.litresForDistance);
    return [{
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      name: [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim() || vehicle.plateNumber,
      vehicleType: vehicle.type,
      fuelType: mostCommon(own.map((record) => record.fuelType)) ?? vehicle.fuelType,
      fillUps: own.length,
      litres: round1(own.reduce((sum, record) => sum + record.liters, 0)),
      costNgn: Math.round(own.reduce((sum, record) => sum + record.totalCost, 0)),
      distanceKm: odometer.distanceKm === null ? null : Math.round(odometer.distanceKm),
      efficiencyKmPerLitre:
        odometer.litresForDistance > 0 && odometer.distanceKm ? round1(odometer.distanceKm / odometer.litresForDistance) : null,
      trips: deliveredByVehicle.get(vehicle.id) ?? 0,
    }];
  });
  return { rows, litresForDistance };
}

export function summarizeFuel(rows: FuelReportRow[], litresForDistance: Map<string, number>) {
  const measured = rows.filter((row) => row.efficiencyKmPerLitre !== null);
  const measuredKm = measured.reduce((sum, row) => sum + (row.distanceKm ?? 0), 0);
  const withDistance = rows.filter((row) => row.distanceKm !== null);
  const measuredLitres = measured.reduce((sum, row) => sum + (litresForDistance.get(row.vehicleId) ?? 0), 0);
  return {
    totalLitres: round1(rows.reduce((sum, row) => sum + row.litres, 0)),
    totalCostNgn: rows.reduce((sum, row) => sum + row.costNgn, 0),
    totalDistanceKm: withDistance.length > 0 ? withDistance.reduce((sum, row) => sum + row.distanceKm!, 0) : null,
    avgEfficiencyKmPerLitre: measuredLitres > 0 ? round1(measuredKm / measuredLitres) : null,
    fillUps: rows.reduce((sum, row) => sum + row.fillUps, 0),
    vehiclesWithFuel: rows.length,
  };
}
