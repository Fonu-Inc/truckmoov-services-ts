import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { Vehicle, isFleetFuelType } from "../../domain/entities/vehicle.entity";
import type {
  VehicleFilters,
  VehicleRepository,
} from "../../domain/repositories/vehicle.repository";
import {
  FleetFinancialConfigRecord,
  VehicleRecord,
  getFleetOrm,
} from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroVehicleRepository implements VehicleRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(vehicle: Vehicle): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();

    await em.upsert(VehicleRecord, {
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      type: vehicle.type,
      fuelType: vehicle.fuelType,
      capacity: vehicle.capacity,
      capacityUnit: vehicle.capacityUnit,
      tenantId: vehicle.tenantId,
      status: vehicle.status,
      assignedDriverId: vehicle.assignedDriverId,
      ownerOperatorId: vehicle.ownerOperatorId,
      gpsImei: vehicle.gpsDevice?.imei ?? null,
      gpsManufacturer: vehicle.gpsDevice?.manufacturer ?? null,
      gpsModel: vehicle.gpsDevice?.model ?? null,
      gpsFirmwareVersion: vehicle.gpsDevice?.firmwareVersion ?? null,
      // Mirror the old fields during the transition so legacy rows and ad hoc queries remain usable.
      gpsDeviceId: vehicle.gpsDevice?.imei ?? null,
      gpsProvider: vehicle.gpsDevice?.manufacturer ?? null,
      gpsSerialNumber: vehicle.gpsDevice?.imei ?? null,
      gpsInstalledAt: vehicle.gpsDevice?.installedAt
        ? new Date(vehicle.gpsDevice.installedAt)
        : null,
      updatedAt: new Date(),
    });
  }

  async findAll(filters?: VehicleFilters): Promise<Vehicle[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      VehicleRecord,
      {
        ...(filters?.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters?.ownerOperatorId ? { ownerOperatorId: filters.ownerOperatorId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.type ? { type: filters.type } : {}),
        ...(filters?.assigned === undefined
          ? {}
          : filters.assigned
            ? { assignedDriverId: { $ne: null } }
            : { assignedDriverId: null }),
      },
      { orderBy: { createdAt: "asc" } },
    );

    const query = filters?.query?.trim().toLowerCase();
    const yearFrom = filters?.yearFrom;
    const yearTo = filters?.yearTo;

    const filtered = records.filter((record) => {
      if (yearFrom && (record.year == null || record.year < yearFrom)) return false;
      if (yearTo && (record.year == null || record.year > yearTo)) return false;
      if (!query) return true;
      return [
        record.id,
        record.plateNumber,
        record.vin ?? "",
        record.make ?? "",
        record.model,
        record.type ?? "",
        record.gpsImei ?? record.gpsDeviceId ?? "",
        record.gpsManufacturer ?? record.gpsProvider ?? "",
        record.gpsModel ?? "",
        record.gpsFirmwareVersion ?? "",
      ].some((value) => value.toLowerCase().includes(query));
    });

    return filtered.map((record) => this.toDomain(record));
  }

  async findById(id: string, tenantId: string): Promise<Vehicle | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(VehicleRecord, { id, tenantId });
    return record ? this.toDomain(record) : null;
  }

  // The vehicle's cost settings go with it: they price nothing once it is gone.
  async deleteById(id: string, tenantId: string): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    await orm.em.fork().transactional(async (tx) => {
      await tx.nativeDelete(FleetFinancialConfigRecord, { vehicleId: id, tenantId });
      await tx.nativeDelete(VehicleRecord, { id, tenantId });
    });
  }

  async findByPlateNumber(plateNumber: string, tenantId: string): Promise<Vehicle | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(VehicleRecord, {
      plateNumber: plateNumber.trim().toUpperCase(),
      tenantId: tenantId.trim(),
    });
    return record ? this.toDomain(record) : null;
  }

  async findByAssignedDriverId(driverId: string, tenantId: string): Promise<Vehicle | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(VehicleRecord, {
      assignedDriverId: driverId,
      tenantId,
    });
    return record ? this.toDomain(record) : null;
  }

  async findAllByOwnerOperatorId(ownerOperatorId: string, tenantId: string): Promise<Vehicle[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(VehicleRecord, {
      ownerOperatorId,
      tenantId,
    });
    return records.map((record) => this.toDomain(record));
  }

  private toDomain(record: VehicleRecord) {
    return Vehicle.create({
      id: record.id,
      plateNumber: record.plateNumber,
      vin: record.vin ?? null,
      make: record.make ?? null,
      model: record.model,
      year: record.year ?? null,
      type: record.type === null || record.type === undefined
        ? null
        : record.type === "truck" || record.type === "van" || record.type === "trailer"
          ? record.type
          : null,
      fuelType: isFleetFuelType(record.fuelType) ? record.fuelType : null,
      capacity: record.capacity ?? null,
      capacityUnit: (record.capacityUnit as never) ?? null,
      tenantId: record.tenantId,
      status: (["active", "inactive", "maintenance", "decommissioned"].includes(record.status)
        ? record.status
        : "active") as import("../../../shared/domain/fleet-status").FleetAssetStatus,
      assignedDriverId: record.assignedDriverId ?? null,
      ownerOperatorId: record.ownerOperatorId ?? null,
      gpsDevice:
        (record.gpsImei ?? record.gpsDeviceId)
        && (record.gpsManufacturer ?? record.gpsProvider)
          ? {
              imei: record.gpsImei ?? record.gpsDeviceId ?? "",
              manufacturer: record.gpsManufacturer ?? record.gpsProvider ?? "",
              model: record.gpsModel ?? "Unknown",
              firmwareVersion: record.gpsFirmwareVersion ?? "Unknown",
              installedAt:
                record.gpsInstalledAt?.toISOString() ?? new Date().toISOString(),
            }
          : null,
      createdAt: record.createdAt?.toISOString(),
    });
  }
}
