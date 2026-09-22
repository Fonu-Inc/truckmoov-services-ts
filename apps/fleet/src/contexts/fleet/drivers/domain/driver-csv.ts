import {
  buildCsvExport,
  buildCsvTemplate,
  parseCsvRecords,
  type CsvColumn,
  type CsvRowError,
} from "@shared/csv";
import { DRIVER_COMMUNICATION_PREFERENCES } from "./entities/driver.entity";

export type DriverCsvRow = {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  licenseNumber: string;
  licenseExpiryDate: string | null;
  preferredChannel: string | null;
  status: string | null;
};

export type DriverCsvColumn = CsvColumn;

const DRIVER_CSV_STATUSES = ["active", "available", "offline", "suspended"] as const;

// One definition behind the template, the import and the export, so an export
// can be edited and imported back without reshaping.
export const DRIVER_CSV_COLUMNS: readonly DriverCsvColumn[] = [
  { header: "first_name", required: true, example: "Chukwuemeka", note: "" },
  { header: "last_name", required: true, example: "Okafor", note: "" },
  {
    header: "phone",
    required: false,
    example: "+2348012345678",
    note: "Nigerian mobile number. Required to reach the driver on any channel.",
  },
  { header: "email", required: false, example: "chukwuemeka.o@email.com", note: "" },
  {
    header: "license_number",
    required: true,
    example: "DL-2345-6789",
    note: "Matches an existing driver by licence number and updates it; otherwise creates one.",
  },
  {
    header: "license_expiry",
    required: false,
    example: "2026-08-15",
    note: "ISO date. Drives the expiry warning on the roster.",
  },
  {
    header: "preferred_channel",
    required: false,
    example: "whatsapp",
    note: `One of: ${DRIVER_COMMUNICATION_PREFERENCES.join(", ")}. Defaults to whatsapp.`,
  },
  {
    header: "status",
    required: false,
    example: "active",
    note: `One of: ${DRIVER_CSV_STATUSES.join(", ")}. Defaults to active.`,
  },
];

export class DriverCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriverCsvError";
  }
}

export type DriverCsvParseResult = {
  rows: DriverCsvRow[];
  errors: CsvRowError[];
};

export function buildDriverCsvTemplate(): string {
  return buildCsvTemplate(DRIVER_CSV_COLUMNS);
}

export function buildDriverCsvExport(drivers: DriverCsvRow[]): string {
  return buildCsvExport(
    DRIVER_CSV_COLUMNS,
    drivers.map((driver) => [
      driver.firstName,
      driver.lastName,
      driver.phone,
      driver.email,
      driver.licenseNumber,
      driver.licenseExpiryDate,
      driver.preferredChannel,
      driver.status,
    ]),
  );
}

export function parseDriverCsv(content: string): DriverCsvParseResult {
  return parseCsvRecords(
    content,
    DRIVER_CSV_COLUMNS,
    toRow,
    (missing) => new DriverCsvError(`The CSV is missing required column(s): ${missing.join(", ")}`),
    () => new DriverCsvError("The CSV file is empty"),
  );
}

function toRow(record: Record<string, string>): DriverCsvRow {
  const firstName = record["first_name"];
  const lastName = record["last_name"];
  const licenseNumber = record["license_number"];
  if (!firstName) throw new DriverCsvError("first_name is required");
  if (!lastName) throw new DriverCsvError("last_name is required");
  if (!licenseNumber) throw new DriverCsvError("license_number is required");

  const email = record["email"] || null;
  if (email !== null && !/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email)) {
    throw new DriverCsvError("email is not a valid address");
  }

  const licenseExpiryDate = record["license_expiry"] || null;
  if (licenseExpiryDate !== null && !Number.isFinite(Date.parse(licenseExpiryDate))) {
    throw new DriverCsvError("license_expiry must be a date");
  }

  return {
    firstName,
    lastName,
    phone: record["phone"] || null,
    email,
    licenseNumber,
    licenseExpiryDate,
    preferredChannel: optionalEnum(
      record["preferred_channel"],
      DRIVER_COMMUNICATION_PREFERENCES as readonly string[],
      "preferred_channel",
    ),
    status: optionalEnum(record["status"], DRIVER_CSV_STATUSES as readonly string[], "status"),
  };
}

function optionalEnum(raw: string | undefined, allowed: readonly string[], field: string): string | null {
  if (!raw) return null;
  const value = raw.toLowerCase();
  if (!allowed.includes(value)) {
    throw new DriverCsvError(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}
