export type FuelRecordView = {
  fuelType: string | null;
  liters: number;
  totalCost: number;
  station: string | null;
  recordedAt?: string | null;
  createdAt?: string | null;
  vehiclePlateNumber: string | null;
  driverName: string | null;
};

export type FuelFilterCriteria = {
  query?: string;
  fuelType?: string;
  litresFrom?: number;
  litresTo?: number;
  totalFrom?: number;
  totalTo?: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function applyFuelFilters<T extends FuelRecordView>(
  records: T[],
  criteria: FuelFilterCriteria,
): T[] {
  const term = criteria.query?.trim().toLowerCase();

  return records.filter((record) => {
    if (criteria.fuelType && record.fuelType !== criteria.fuelType) return false;
    if (criteria.litresFrom !== undefined && record.liters < criteria.litresFrom) return false;
    if (criteria.litresTo !== undefined && record.liters > criteria.litresTo) return false;
    if (criteria.totalFrom !== undefined && record.totalCost < criteria.totalFrom) return false;
    if (criteria.totalTo !== undefined && record.totalCost > criteria.totalTo) return false;
    if (!term) return true;

    return [record.vehiclePlateNumber, record.driverName, record.station].some((field) =>
      (field ?? "").toLowerCase().includes(term),
    );
  });
}

/**
 * Litres per weekday, split by fuel type. Every weekday and every fuel type
 * seen is present with a zero rather than omitted, so the chart's bars keep
 * their positions when a day has no purchases.
 */
export function buildWeeklyFuelSeries(records: FuelRecordView[]) {
  const fuelTypes = [...new Set(records.map((record) => record.fuelType ?? "unknown"))].sort();
  const days = WEEKDAYS.map((day) => ({
    day,
    litres: Object.fromEntries(fuelTypes.map((type) => [type, 0])) as Record<string, number>,
    totalLitres: 0,
  }));

  for (const record of records) {
    const timestamp = Date.parse(record.recordedAt ?? record.createdAt ?? "");
    if (!Number.isFinite(timestamp)) continue;
    const bucket = days[new Date(timestamp).getUTCDay()];
    const type = record.fuelType ?? "unknown";
    bucket.litres[type] = round1((bucket.litres[type] ?? 0) + record.liters);
    bucket.totalLitres = round1(bucket.totalLitres + record.liters);
  }

  return { fuelTypes, days };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
