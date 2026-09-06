import {
  buildCsvExport,
  buildCsvTemplate,
  parseCsvRecords,
  type CsvColumn,
  type CsvRowError,
} from "../../shared/domain/csv";
import { FLEET_ASSET_STATUSES } from "../../shared/domain/fleet-status";
import {
  DEFAULT_CAPACITY_UNIT,
  normalizeCapacityUnit,
  VEHICLE_CAPACITY_UNITS,
  VehicleCapacityError,
  type VehicleCapacityUnit,
} from "./vehicle-capacity";
import { FLEET_FUEL_TYPES } from "./entities/vehicle.entity";

export const FLEET_VEHICLE_TYPES = ["truck", "van", "trailer"] as const;

export type VehicleCsvRow = {
  registrationNumber: string;
  vin: string | null;
  make: string | null;
  model: string;
  year: number | null;
  type: string | null;
  fuelType: string | null;
  capacity: number | null;
  capacityUnit: VehicleCapacityUnit;
  status: string | null;
};

export type VehicleCsvColumn = CsvColumn;

// One definition drives the downloadable template, the import parser and the
// export. A round trip has to work: what a tenant exports must be importable
// without editing, so these three cannot be allowed to drift apart.
export const VEHICLE_CSV_COLUMNS: readonly VehicleCsvColumn[] = [
  {
    header: "registration_number",
    required: true,
    example: "LAG-234-XY",
    note: "Matches an existing vehicle by registration and updates it; otherwise creates one.",
  },
  { header: "vin", required: false, example: "WDB9634031L123456", note: "Exactly 17 characters when supplied." },
  { header: "make", required: false, example: "Mercedes-Benz", note: "" },
  { header: "model", required: true, example: "Actros", note: "" },
  { header: "year", required: false, example: "2022", note: "Four digits, 1990 or later." },
  { header: "type", required: false, example: "truck", note: `One of: ${FLEET_VEHICLE_TYPES.join(", ")}.` },
  { header: "fuel_type", required: false, example: "diesel", note: `One of: ${FLEET_FUEL_TYPES.join(", ")}.` },
  { header: "capacity", required: false, example: "30", note: "Load capacity, in capacity_unit." },
  {
    header: "capacity_unit",
    required: false,
    example: "tons",
    note: `One of: ${VEHICLE_CAPACITY_UNITS.join(", ")}. Defaults to ${DEFAULT_CAPACITY_UNIT}.`,
  },
  { header: "status", required: false, example: "active", note: `One of: ${FLEET_ASSET_STATUSES.join(", ")}. Defaults to active.` },
];

export class VehicleCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VehicleCsvError";
  }
}

export type VehicleCsvParseResult = {
  rows: VehicleCsvRow[];
  errors: CsvRowError[];
};

export function buildVehicleCsvTemplate(): string {
  return buildCsvTemplate(VEHICLE_CSV_COLUMNS);
}

export function buildVehicleCsvExport(vehicles: VehicleCsvRow[]): string {
  return buildCsvExport(
    VEHICLE_CSV_COLUMNS,
    vehicles.map((vehicle) => [
      vehicle.registrationNumber,
      vehicle.vin,
      vehicle.make,
      vehicle.model,
      vehicle.year,
      vehicle.type,
      vehicle.fuelType,
      vehicle.capacity,
      vehicle.capacityUnit,
      vehicle.status,
    ]),
  );
}

export function parseVehicleCsv(content: string): VehicleCsvParseResult {
  return parseCsvRecords(
    content,
    VEHICLE_CSV_COLUMNS,
    toRow,
    (missing) => new VehicleCsvError(`The CSV is missing required column(s): ${missing.join(", ")}`),
    () => new VehicleCsvError("The CSV file is empty"),
  );
}

function toRow(record: Record<string, string>): VehicleCsvRow {
  const registrationNumber = record["registration_number"];
  if (!registrationNumber) throw new VehicleCsvError("registration_number is required");

  const model = record["model"];
  if (!model) throw new VehicleCsvError("model is required");

  const vin = record["vin"] || null;
  if (vin !== null && vin.length !== 17) {
    throw new VehicleCsvError("vin must be exactly 17 characters when supplied");
  }

  const year = optionalNumber(record["year"], "year");
  if (year !== null && (year < 1990 || year > new Date().getFullYear() + 1)) {
    throw new VehicleCsvError("year is out of range");
  }

  const type = optionalEnum(record["type"], FLEET_VEHICLE_TYPES as readonly string[], "type");
  const fuelType = optionalEnum(record["fuel_type"], FLEET_FUEL_TYPES as readonly string[], "fuel_type");
  const status = optionalEnum(record["status"], FLEET_ASSET_STATUSES as readonly string[], "status");
  // capacity_tons is still read so files exported before units existed import
  // unchanged, and they meant tons.
  const legacyTons = record["capacity_tons"];
  const capacity = optionalNumber(record["capacity"] || legacyTons, "capacity");
  let capacityUnit: VehicleCapacityUnit;
  try {
    capacityUnit = legacyTons && !record["capacity"]
      ? "tons"
      : normalizeCapacityUnit(record["capacity_unit"]);
  } catch (error) {
    throw new VehicleCsvError(
      error instanceof VehicleCapacityError ? error.message : "capacity_unit is invalid",
    );
  }
  if (capacity !== null && capacity < 0) {
    throw new VehicleCsvError("capacity must be zero or greater");
  }

  return {
    registrationNumber,
    vin,
    make: record["make"] || null,
    model,
    year,
    type,
    fuelType,
    capacity,
    capacityUnit,
    status,
  };
}

function optionalNumber(raw: string | undefined, field: string): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new VehicleCsvError(`${field} must be a number`);
  return parsed;
}

function optionalEnum(raw: string | undefined, allowed: readonly string[], field: string): string | null {
  if (!raw) return null;
  const value = raw.toLowerCase();
  if (!allowed.includes(value)) {
    throw new VehicleCsvError(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}
