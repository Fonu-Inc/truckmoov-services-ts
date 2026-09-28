export const VEHICLE_CAPACITY_UNITS = ["kg", "lb", "tons", "m3", "pallets"] as const;
export type VehicleCapacityUnit = (typeof VEHICLE_CAPACITY_UNITS)[number];

export const DEFAULT_CAPACITY_UNIT: VehicleCapacityUnit = "tons";

export const VEHICLE_CAPACITY_UNIT_LABELS: Record<VehicleCapacityUnit, string> = {
  kg: "Kilograms (kg)",
  lb: "Pounds (lb)",
  tons: "Tons",
  m3: "Cubic metres (m³)",
  pallets: "Pallets",
};

// Three different things are being measured here: mass, volume and a count of
// pallets. They are not interconvertible, so a capacity is stored as the number
// entered plus its unit, and only the mass units collapse to a common figure.
const KG_PER_UNIT: Partial<Record<VehicleCapacityUnit, number>> = {
  kg: 1,
  lb: 0.45359237,
  tons: 1000,
};

export class VehicleCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VehicleCapacityError";
  }
}

export function isVehicleCapacityUnit(value: unknown): value is VehicleCapacityUnit {
  return typeof value === "string" && (VEHICLE_CAPACITY_UNITS as readonly string[]).includes(value);
}

export function normalizeCapacityUnit(value: unknown): VehicleCapacityUnit {
  if (value === null || value === undefined || value === "") return DEFAULT_CAPACITY_UNIT;
  const candidate = String(value).trim().toLowerCase().replace("³", "3");
  const aliases: Record<string, VehicleCapacityUnit> = {
    kg: "kg",
    kilogram: "kg",
    kilograms: "kg",
    lb: "lb",
    lbs: "lb",
    pound: "lb",
    pounds: "lb",
    ton: "tons",
    tons: "tons",
    tonne: "tons",
    tonnes: "tons",
    m3: "m3",
    cbm: "m3",
    pallet: "pallets",
    pallets: "pallets",
  };
  const resolved = aliases[candidate];
  if (!resolved) {
    throw new VehicleCapacityError(
      `capacity unit must be one of: ${VEHICLE_CAPACITY_UNITS.join(", ")}`,
    );
  }
  return resolved;
}

export function assertCapacityWithinRange(capacity: number, _unit: VehicleCapacityUnit): void {
  if (capacity < 0) throw new VehicleCapacityError("capacity must be zero or greater");
}

/** Kilograms, for the mass units only. Volume and pallets return null. */
export function capacityWeightKg(
  capacity: number | null,
  unit: VehicleCapacityUnit,
): number | null {
  if (capacity === null) return null;
  const factor = KG_PER_UNIT[unit];
  return factor === undefined ? null : Math.round(capacity * factor * 100) / 100;
}

/** Cubic metres, for the volume unit only. */
export function capacityVolumeM3(
  capacity: number | null,
  unit: VehicleCapacityUnit,
): number | null {
  if (capacity === null) return null;
  return unit === "m3" ? capacity : null;
}

/** Pallet count, for the pallet unit only. */
export function capacityPallets(
  capacity: number | null,
  unit: VehicleCapacityUnit,
): number | null {
  if (capacity === null) return null;
  return unit === "pallets" ? capacity : null;
}
