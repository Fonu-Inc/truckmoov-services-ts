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

export type DriverCsvColumn = {
  header: string;
  required: boolean;
  example: string;
  note: string;
};

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
  errors: Array<{ line: number; message: string }>;
};

export function buildDriverCsvTemplate(): string {
  return `${DRIVER_CSV_COLUMNS.map((c) => c.header).join(",")}\n${DRIVER_CSV_COLUMNS.map((c) => c.example).join(",")}\n`;
}

export function buildDriverCsvExport(drivers: DriverCsvRow[]): string {
  const headers = DRIVER_CSV_COLUMNS.map((c) => c.header);
  const lines = drivers.map((driver) =>
    [
      driver.firstName,
      driver.lastName,
      driver.phone,
      driver.email,
      driver.licenseNumber,
      driver.licenseExpiryDate,
      driver.preferredChannel,
      driver.status,
    ]
      .map(escapeCsvValue)
      .join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

export function parseDriverCsv(content: string): DriverCsvParseResult {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new DriverCsvError("The CSV file is empty");

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const missing = DRIVER_CSV_COLUMNS.filter((c) => c.required && !headers.includes(c.header));
  if (missing.length > 0) {
    throw new DriverCsvError(
      `The CSV is missing required column(s): ${missing.map((c) => c.header).join(", ")}`,
    );
  }

  const rows: DriverCsvRow[] = [];
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

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_").replace(/^﻿/, "");
}

// A name is whatever a person typed. A spreadsheet reads a leading =, +, -, @
// or control character as a formula, so it is neutralised on the way out and
// stripped again on the way in.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function escapeCsvValue(value: string | null): string {
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
