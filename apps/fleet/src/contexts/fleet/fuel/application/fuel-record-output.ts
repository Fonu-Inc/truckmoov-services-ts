import type { AuditEntry, FuelRecord } from "../domain/entities/fuel-record.entity";
import type { VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import type { DriverRepository } from "../../drivers/domain/repositories/driver.repository";

export type FuelRecordOutput = {
  id: string;
  tenantId: string;
  vehicleId: string;
  driverId: string | null;
  vehicleType: string | null;
  fuelType: string | null;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  station: string | null;
  odometer: number | null;
  recordedAt: string;
  recordedBy: string;
  deletedAt: string | null;
  auditTrail: AuditEntry[];
  vehiclePlateNumber: string | null;
  driverName: string | null;
};

/** The fields, in order, of every fuel record a route returns; the CSV export's columns. */
export const FUEL_RECORD_FIELDS: readonly (keyof FuelRecordOutput)[] = [
  "id",
  "tenantId",
  "vehicleId",
  "driverId",
  "vehicleType",
  "fuelType",
  "liters",
  "pricePerLiter",
  "totalCost",
  "station",
  "odometer",
  "recordedAt",
  "recordedBy",
  "deletedAt",
  "auditTrail",
  "vehiclePlateNumber",
  "driverName",
];

/** Create, edit and list all answer with this one shape, so they cannot drift apart. */
export async function toFuelRecordOutput(
  record: FuelRecord,
  tenantId: string,
  vehicles: Pick<VehicleRepository, "findById">,
  drivers: Pick<DriverRepository, "findById">,
): Promise<FuelRecordOutput> {
  const [vehicle, driver] = await Promise.all([
    vehicles.findById(record.vehicleId, tenantId),
    record.driverId ? drivers.findById(record.driverId, tenantId) : Promise.resolve(null),
  ]);
  return {
    id: record.id,
    tenantId: record.tenantId,
    vehicleId: record.vehicleId,
    driverId: record.driverId,
    vehicleType: record.vehicleType,
    fuelType: record.fuelType,
    liters: record.liters,
    pricePerLiter: record.pricePerLiter,
    totalCost: record.totalCost,
    station: record.station,
    odometer: record.odometer,
    recordedAt: record.recordedAt,
    recordedBy: record.recordedBy,
    deletedAt: record.deletedAt,
    auditTrail: record.auditTrail,
    vehiclePlateNumber: vehicle?.plateNumber ?? null,
    driverName: driver?.name ?? null,
  };
}
