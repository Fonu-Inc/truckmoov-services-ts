import type { Device } from "./contexts/fleet/devices/domain/entities/device.entity";
import type { Driver } from "./contexts/fleet/drivers/domain/entities/driver.entity";
import type { Vehicle } from "./contexts/fleet/vehicles/domain/entities/vehicle.entity";

export const TENANT_EXPORT_SCOPES = ["vehicles", "drivers", "devices"] as const;
export type TenantExportScope = (typeof TENANT_EXPORT_SCOPES)[number];

export function isTenantExportScope(value: string): value is TenantExportScope {
  return (TENANT_EXPORT_SCOPES as readonly string[]).includes(value);
}

export type ExportCell = string | number | boolean | null;
export type TenantExportTable = { columns: string[]; rows: ExportCell[][] };

export function vehicleExport(vehicles: Vehicle[]): TenantExportTable {
  return {
    columns: [
      "id", "plate_number", "vin", "make", "model", "year", "type", "fuel_type", "capacity",
      "capacity_unit", "status", "assigned_driver_id", "owner_operator_id", "gps_imei",
    ],
    rows: vehicles.map((v) => [
      v.id, v.plateNumber, v.vin, v.make, v.model, v.year, v.type, v.fuelType ?? null, v.capacity,
      v.capacityUnit, v.status, v.assignedDriverId, v.ownerOperatorId, v.gpsDevice?.imei ?? null,
    ]),
  };
}

export function driverExport(drivers: Driver[]): TenantExportTable {
  return {
    columns: [
      "id", "name", "phone", "email", "license_number", "license_expiry_date", "status",
      "assigned_vehicle_id", "communication_preference", "created_at",
    ],
    rows: drivers.map((d) => [
      d.id, d.name, d.phone, d.email, d.licenseNumber, d.licenseExpiryDate, d.status,
      d.assignedVehicleId, d.communicationPreference, d.createdAt,
    ]),
  };
}

export function deviceExport(devices: Device[]): TenantExportTable {
  return {
    columns: [
      "id", "imei", "name", "manufacturer", "model", "firmware_version", "status", "vehicle_id",
      "protocol", "last_seen", "assigned_at", "verification_status", "created_at",
    ],
    rows: devices.map((d) => [
      d.id, d.imei, d.name, d.manufacturer, d.model, d.firmwareVersion, d.lifecycleStatus, d.vehicleId,
      d.protocol, cell(d.lastSeen), cell(d.assignedAt), d.verificationStatus, cell(d.createdAt),
    ]),
  };
}

function cell(value: unknown): ExportCell {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
