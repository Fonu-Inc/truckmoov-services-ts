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

export type VehicleCsvColumn = {
  header: string;
  required: boolean;
  example: string;
  note: string;
};

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
  errors: Array<{ line: number; message: string }>;
};

export function buildVehicleCsvTemplate(): string {
  const headers = VEHICLE_CSV_COLUMNS.map((column) => column.header);
  const example = VEHICLE_CSV_COLUMNS.map((column) => column.example);
  return `${headers.join(",")}\n${example.join(",")}\n`;
}

export function buildVehicleCsvExport(vehicles: VehicleCsvRow[]): string {
  const headers = VEHICLE_CSV_COLUMNS.map((column) => column.header);
  const lines = vehicles.map((vehicle) =>
    [
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
    ]
      .map(escapeCsvValue)
      .join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

/**
 * Parses an uploaded CSV. Bad rows are collected rather than thrown: a file of
 * two hundred vehicles with three broken lines should import the other hundred
 * and ninety seven and say which three failed.
 */
export function parseVehicleCsv(content: string): VehicleCsvParseResult {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new VehicleCsvError("The CSV file is empty");

  const headers = splitCsvLine(lines[0]).map((header) => normalizeHeader(header));
  const missing = VEHICLE_CSV_COLUMNS.filter((column) => column.required && !headers.includes(column.header));
  if (missing.length > 0) {
    throw new VehicleCsvError(
      `The CSV is missing required column(s): ${missing.map((column) => column.header).join(", ")}`,
    );
  }

  const rows: VehicleCsvRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCsvLine(lines[index]);
    const record: Record<string, string> = {};
    headers.forEach((header, position) => {
      record[header] = stripFormulaGuard((values[position] ?? "").trim());
    });

    try {
      rows.push(toRow(record));
    } catch (error) {
      errors.push({
        line: index + 1,
        message: error instanceof Error ? error.message : "Row could not be read",
      });
    }
  }

  return { rows, errors };
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

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_").replace(/^﻿/, "");
}

// A make or model is whatever a person typed. A spreadsheet reads a leading
// =, +, -, @ or control character as a formula, so it is neutralised with an
// apostrophe on the way out and stripped again on the way in, which keeps an
// export importable without changing the stored value.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function escapeCsvValue(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const text = FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function stripFormulaGuard(value: string): string {
  return value.startsWith("'") && FORMULA_LEAD.test(value.slice(1)) ? value.slice(1) : value;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ",") {
      values.push(current);
      current = "";
    } else current += character;
  }

  values.push(current);
  return values;
}
