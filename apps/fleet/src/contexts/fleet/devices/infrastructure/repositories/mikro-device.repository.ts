import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  Device,
  isDeviceLifecycleStatus,
  isDeviceStatus,
} from "../../domain/entities/device.entity";
import type { DeviceFilters, DeviceRepository } from "../../domain/repositories/device.repository";
import { DeviceRecord, getFleetOrm } from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroDeviceRepository implements DeviceRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(device: Device): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();

    await em.upsert(DeviceRecord, {
      id: device.id,
      imei: device.imei,
      manufacturer: device.manufacturer,
      model: device.model,
      firmwareVersion: device.firmwareVersion,
      tenantId: device.tenantId,
      status: device.status,
      lifecycleStatus: device.lifecycleStatus,
      vehicleId: device.vehicleId,
      signalStrength: device.signalStrength,
      batteryLevel: device.batteryLevel,
      lastSeen: device.lastSeen ? new Date(device.lastSeen) : null,
      assignedAt: device.assignedAt ? new Date(device.assignedAt) : null,
      createdAt: new Date(device.createdAt),
      updatedAt: new Date(device.updatedAt),
    });
  }

  async findAll(filters?: DeviceFilters): Promise<Device[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      DeviceRecord,
      {
        ...(filters?.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters?.manufacturer ? { manufacturer: filters.manufacturer } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.lifecycleStatus ? { lifecycleStatus: filters.lifecycleStatus } : {}),
        ...(filters?.vehicleId ? { vehicleId: filters.vehicleId } : {}),
        ...(filters?.assigned === undefined
          ? {}
          : filters.assigned
            ? { vehicleId: { $ne: null } }
            : { vehicleId: null }),
      },
      { orderBy: { createdAt: "asc" } },
    );

    const query = filters?.query?.trim().toLowerCase();
    const filtered = !query
      ? records
      : records.filter((record) =>
          [
            record.id,
            record.imei,
            record.manufacturer,
            record.model,
            record.firmwareVersion,
            record.status,
            record.lifecycleStatus,
            record.vehicleId ?? "",
          ].some((value) => value.toLowerCase().includes(query)),
        );

    return filtered.map((record) => this.toDomain(record));
  }

  async findById(id: string): Promise<Device | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DeviceRecord, { id });
    return record ? this.toDomain(record) : null;
  }

  async findByImei(imei: string, tenantId: string): Promise<Device | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DeviceRecord, {
      imei: imei.trim(),
      tenantId: tenantId.trim(),
    });
    return record ? this.toDomain(record) : null;
  }

  async findByVehicleId(vehicleId: string): Promise<Device | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DeviceRecord, { vehicleId });
    return record ? this.toDomain(record) : null;
  }

  async deleteById(id: string): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(DeviceRecord, { id });
  }

  private toDomain(record: DeviceRecord) {
    return Device.create({
      id: record.id,
      imei: record.imei,
      manufacturer: record.manufacturer,
      model: record.model,
      firmwareVersion: record.firmwareVersion,
      tenantId: record.tenantId,
      status: isDeviceStatus(record.status) ? record.status : "registered",
      lifecycleStatus: isDeviceLifecycleStatus(record.lifecycleStatus)
        ? record.lifecycleStatus
        : "registered",
      vehicleId: record.vehicleId ?? null,
      signalStrength: record.signalStrength ?? null,
      batteryLevel: record.batteryLevel ?? null,
      lastSeen: record.lastSeen?.toISOString() ?? null,
      assignedAt: record.assignedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}
