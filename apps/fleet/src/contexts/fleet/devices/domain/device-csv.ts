import { DEVICE_LIFECYCLE_STATUSES, type DeviceLifecycleStatus } from "@shared/devices";
import {
  buildCsvExport,
  buildCsvTemplate,
  parseCsvRecords,
  type CsvColumn,
  type CsvRowError,
} from "@shared/csv";

export type DeviceCsvRow = {
  imei: string;
  name: string | null;
  manufacturer: string;
  model: string;
  firmwareVersion: string | null;
  lifecycleStatus: DeviceLifecycleStatus | null;
};

export type DeviceCsvColumn = CsvColumn;

// Lifecycle states an operator may set from a spreadsheet. The rest are
// reached by the platform (verification, assignment) or by an administrator
// (suspension), and accepting them here would let an import claim a device is
// online when nothing has ever reported.
export const DEVICE_CSV_LIFECYCLE_STATUSES: readonly DeviceLifecycleStatus[] = [
  "registered",
  "config_pending",
  "configured",
];

export const DEVICE_CSV_COLUMNS: readonly DeviceCsvColumn[] = [
  {
    header: "imei",
    required: true,
    example: "359779090012345",
    note: "15 digits. Matches an existing device and updates it; otherwise registers a new one.",
  },
  {
    header: "device_name",
    required: false,
    example: "Truck 12 — Tracker",
    note: "Label shown in your inventory. Falls back to manufacturer and model when blank.",
  },
  {
    header: "manufacturer",
    required: true,
    example: "Teltonika",
    note: "Must be a manufacturer in the platform device catalog.",
  },
  {
    header: "model",
    required: true,
    example: "FMC130",
    note: "Must be a model the catalog lists for that manufacturer.",
  },
  {
    header: "firmware_version",
    required: false,
    example: "1.0.0",
    note: "Defaults to 1.0.0 when blank.",
  },
  {
    header: "lifecycle_status",
    required: false,
    example: "registered",
    note: `One of: ${DEVICE_CSV_LIFECYCLE_STATUSES.join(", ")}. Defaults to registered.`,
  },
];

export class DeviceCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceCsvError";
  }
}

export type DeviceCsvParseResult = {
  rows: DeviceCsvRow[];
  errors: CsvRowError[];
};

export function buildDeviceCsvTemplate(): string {
  return buildCsvTemplate(DEVICE_CSV_COLUMNS);
}

export function buildDeviceCsvExport(devices: DeviceCsvRow[]): string {
  return buildCsvExport(
    DEVICE_CSV_COLUMNS,
    devices.map((device) => [
      device.imei,
      device.name,
      device.manufacturer,
      device.model,
      device.firmwareVersion,
      device.lifecycleStatus,
    ]),
  );
}

export function parseDeviceCsv(content: string): DeviceCsvParseResult {
  const seen = new Set<string>();
  return parseCsvRecords(
    content,
    DEVICE_CSV_COLUMNS,
    (record) => toRow(record, seen),
    (missing) => new DeviceCsvError(`The CSV is missing required column(s): ${missing.join(", ")}`),
    () => new DeviceCsvError("The CSV file is empty"),
  );
}

function toRow(record: Record<string, string>, seen: Set<string>): DeviceCsvRow {
  const imei = record["imei"];
  if (!imei) throw new DeviceCsvError("imei is required");
  if (!/^\d{15}$/.test(imei)) throw new DeviceCsvError("imei must be exactly 15 digits");
  // Two rows for one IMEI would import as a create followed by an update, so
  // the count the operator sees would not match what they sent.
  if (seen.has(imei)) throw new DeviceCsvError(`imei ${imei} appears more than once in this file`);
  seen.add(imei);

  const manufacturer = record["manufacturer"];
  if (!manufacturer) throw new DeviceCsvError("manufacturer is required");

  const model = record["model"];
  if (!model) throw new DeviceCsvError("model is required");

  const lifecycleStatus = record["lifecycle_status"]?.toLowerCase() || "";
  if (lifecycleStatus && !isImportableLifecycle(lifecycleStatus)) {
    throw new DeviceCsvError(
      `lifecycle_status must be one of: ${DEVICE_CSV_LIFECYCLE_STATUSES.join(", ")}`,
    );
  }

  return {
    imei,
    name: record["device_name"] || null,
    manufacturer,
    model,
    firmwareVersion: record["firmware_version"] || null,
    lifecycleStatus: lifecycleStatus === "" ? null : (lifecycleStatus as DeviceLifecycleStatus),
  };
}

function isImportableLifecycle(value: string): value is DeviceLifecycleStatus {
  return (DEVICE_CSV_LIFECYCLE_STATUSES as readonly string[]).includes(value)
    && (DEVICE_LIFECYCLE_STATUSES as readonly string[]).includes(value);
}
