import { Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { Vehicle } from "../../domain/entities/vehicle.entity";
import type {
  VehicleFilters,
  VehicleRepository,
} from "../../domain/repositories/vehicle.repository";
import { VehicleRecord, getFleetOrm } from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroVehicleRepository implements VehicleRepository {
  constructor(private readonly config: AppConfigService) {}

  async save(vehicle: Vehicle): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();

    await em.upsert(VehicleRecord, {
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      model: vehicle.model,
      tenantId: vehicle.tenantId,
      status: vehicle.status,
      assignedDriverId: vehicle.assignedDriverId,
      gpsDeviceId: vehicle.gpsDevice?.deviceId ?? null,
      gpsProvider: vehicle.gpsDevice?.provider ?? null,
      gpsSerialNumber: vehicle.gpsDevice?.serialNumber ?? null,
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
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.assigned === undefined
          ? {}
          : filters.assigned
            ? { assignedDriverId: { $ne: null } }
            : { assignedDriverId: null }),
      },
      { orderBy: { createdAt: "asc" } },
    );

    const query = filters?.query?.trim().toLowerCase();
    const filtered = !query
      ? records
      : records.filter((record) =>
          [
            record.id,
            record.plateNumber,
            record.model,
            record.gpsDeviceId ?? "",
            record.gpsSerialNumber ?? "",
          ].some((value) => value.toLowerCase().includes(query)),
        );

    return filtered.map((record) => this.toDomain(record));
  }

  async findById(id: string): Promise<Vehicle | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(VehicleRecord, { id });
    return record ? this.toDomain(record) : null;
  }

  async deleteById(id: string): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(VehicleRecord, { id });
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

  async findByAssignedDriverId(driverId: string): Promise<Vehicle | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(VehicleRecord, {
      assignedDriverId: driverId,
    });
    return record ? this.toDomain(record) : null;
  }

  private toDomain(record: VehicleRecord) {
    return Vehicle.create({
      id: record.id,
      plateNumber: record.plateNumber,
      model: record.model,
      tenantId: record.tenantId,
      status: record.status === "inactive" ? "inactive" : "active",
      assignedDriverId: record.assignedDriverId ?? null,
      gpsDevice:
        record.gpsDeviceId && record.gpsProvider && record.gpsSerialNumber
          ? {
              deviceId: record.gpsDeviceId,
              provider: record.gpsProvider,
              serialNumber: record.gpsSerialNumber,
              installedAt:
                record.gpsInstalledAt?.toISOString() ?? new Date().toISOString(),
            }
          : null,
    });
  }
}
