import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  Device,
  isDeviceLifecycleStatus,
  isDeviceProvisionStatus,
  isDeviceProtocol,
  isDeviceStatus,
  isDeviceVerificationStatus,
} from "../../domain/entities/device.entity";
import type { DeviceFilters, DeviceRepository } from "../../domain/repositories/device.repository";
import { DeviceRecord, getFleetOrm } from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroDeviceRepository implements DeviceRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(device: Device): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    await orm.em.fork().upsert(DeviceRecord, toRecord(device));
  }

  async saveIfWaitingForVerification(device: Device): Promise<boolean> {
    const orm = await getFleetOrm(this.config.db);
    const { id, tenantId, createdAt: _createdAt, ...changes } = toRecord(device);
    const updated = await orm.em
      .fork()
      .nativeUpdate(DeviceRecord, { id, tenantId, verificationStatus: "waiting" }, changes);
    return updated > 0;
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
        ...(filters?.lifecycleStatusIn
          ? { lifecycleStatus: { $in: filters.lifecycleStatusIn } }
          : {}),
        ...(filters?.verificationStatus
          ? { verificationStatus: filters.verificationStatus }
          : {}),
        ...(filters?.verifiedAfter ? { verifiedAt: { $gte: filters.verifiedAfter } } : {}),
        ...(filters?.vehicleId ? { vehicleId: filters.vehicleId } : {}),
        ...(filters?.assigned === undefined
          ? {}
          : filters.assigned
            ? { vehicleId: { $ne: null } }
            : { vehicleId: null }),
        ...(filters?.lastSeenIsNull ? { lastSeen: null } : {}),
        ...(filters?.lastSeenAfter ? { lastSeen: { $gte: filters.lastSeenAfter } } : {}),
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
            record.name ?? "",
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

  async findById(id: string, tenantId: string): Promise<Device | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DeviceRecord, { id, tenantId });
    return record ? this.toDomain(record) : null;
  }

  async findByIds(tenantId: string, ids: string[]): Promise<Device[]> {
    if (ids.length === 0) return [];
    const orm = await getFleetOrm(this.config.db);
    const records = await orm.em.fork().find(DeviceRecord, { tenantId, id: { $in: ids } });
    return records.map((record) => this.toDomain(record));
  }

  async findByIdAcrossTenants(id: string): Promise<Device | null> {
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

  async findByVehicleId(vehicleId: string, tenantId: string): Promise<Device | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DeviceRecord, { vehicleId, tenantId });
    return record ? this.toDomain(record) : null;
  }

  async findAwaitingVerificationPastDeadline(now: Date, limit: number): Promise<Device[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      DeviceRecord,
      { verificationStatus: "waiting", verificationDeadline: { $lte: now } },
      { orderBy: { verificationDeadline: "asc" }, limit },
    );
    return records.map((record) => this.toDomain(record));
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(DeviceRecord, { id, tenantId });
  }

  private toDomain(record: DeviceRecord) {
    return Device.create({
      id: record.id,
      imei: record.imei,
      name: record.name ?? null,
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
      protocol:
        record.protocol && isDeviceProtocol(record.protocol) ? record.protocol : null,
      port: record.port ?? null,
      reportedProtocol: record.reportedProtocol ?? null,
      configuredAt: record.configuredAt?.toISOString() ?? null,
      verificationStatus:
        record.verificationStatus && isDeviceVerificationStatus(record.verificationStatus)
          ? record.verificationStatus
          : null,
      verificationDeadline: record.verificationDeadline?.toISOString() ?? null,
      verificationError: record.verificationError ?? null,
      verifiedAt: record.verifiedAt?.toISOString() ?? null,
      preSuspensionLifecycleStatus:
        record.preSuspensionLifecycleStatus
        && isDeviceLifecycleStatus(record.preSuspensionLifecycleStatus)
          ? record.preSuspensionLifecycleStatus
          : null,
      suspendedAt: record.suspendedAt?.toISOString() ?? null,
      suspensionReason: record.suspensionReason ?? null,
      traccarDeviceId: record.traccarDeviceId ?? null,
      provisionStatus:
        record.provisionStatus && isDeviceProvisionStatus(record.provisionStatus)
          ? record.provisionStatus
          : "pending",
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}

function toRecord(device: Device) {
  return {
    id: device.id,
    imei: device.imei,
    name: device.name,
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
    protocol: device.protocol,
    port: device.port,
    reportedProtocol: device.reportedProtocol,
    configuredAt: device.configuredAt ? new Date(device.configuredAt) : null,
    verificationStatus: device.verificationStatus,
    verificationDeadline: device.verificationDeadline
      ? new Date(device.verificationDeadline)
      : null,
    verificationError: device.verificationError,
    verifiedAt: device.verifiedAt ? new Date(device.verifiedAt) : null,
    preSuspensionLifecycleStatus: device.preSuspensionLifecycleStatus,
    suspendedAt: device.suspendedAt ? new Date(device.suspendedAt) : null,
    suspensionReason: device.suspensionReason,
    traccarDeviceId: device.traccarDeviceId,
    provisionStatus: device.provisionStatus,
    createdAt: new Date(device.createdAt),
    updatedAt: new Date(device.updatedAt),
  };
}
