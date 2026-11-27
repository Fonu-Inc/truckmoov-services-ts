import { Inject, Injectable } from "@nestjs/common";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
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

  async claimStockDevice(before: Device, moved: Device): Promise<boolean> {
    const orm = await getFleetOrm(this.config.db);
    const { id, createdAt: _createdAt, ...changes } = toRecord(moved);
    const updated = await orm.em.fork().nativeUpdate(
      DeviceRecord,
      { id, tenantId: before.tenantId, vehicleId: null, holdCause: null, lifecycleStatus: before.lifecycleStatus },
      changes,
    );
    return updated > 0;
  }

  async findExistingImeis(imeis: string[]): Promise<Set<string>> {
    if (imeis.length === 0) return new Set();
    const orm = await getFleetOrm(this.config.db);
    const records = await orm.em.fork().find(DeviceRecord, { imei: { $in: imeis } }, { fields: ["imei"] });
    return new Set(records.map((record) => record.imei));
  }

  async insertMany(devices: Device[]): Promise<number> {
    if (devices.length === 0) return 0;
    const orm = await getFleetOrm(this.config.db);
    const rows = devices.map((device) => toRecord(device));
    try {
      await orm.em.fork().insertMany(DeviceRecord, rows);
      return rows.length;
    } catch (error) {
      if (!(error instanceof UniqueConstraintViolationException)) throw error;
    }
    let stored = 0;
    for (const row of rows) {
      try {
        await orm.em.fork().insert(DeviceRecord, row);
        stored += 1;
      } catch (error) {
        if (!(error instanceof UniqueConstraintViolationException)) throw error;
      }
    }
    return stored;
  }

  async saveIfWaitingForVerification(device: Device): Promise<boolean> {
    const orm = await getFleetOrm(this.config.db);
    const { id, tenantId, createdAt: _createdAt, ...changes } = toRecord(device);
    const updated = await orm.em
      .fork()
      .nativeUpdate(DeviceRecord, { id, tenantId, verificationStatus: "waiting" }, changes);
    return updated > 0;
  }

  async findAll(filters: DeviceFilters): Promise<Device[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      DeviceRecord,
      {
        tenantId: filters.tenantId,
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

  async findAllAcrossTenants(): Promise<Device[]> {
    const orm = await getFleetOrm(this.config.db);
    const records = await orm.em.fork().find(DeviceRecord, {}, { orderBy: { createdAt: "asc" } });
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

  async listLiveAfter(afterId: string | null, limit: number): Promise<Device[]> {
    const orm = await getFleetOrm(this.config.db);
    const records = await orm.em.fork().find(
      DeviceRecord,
      { lifecycleStatus: { $ne: "decommissioned" }, imei: { $ne: "" }, id: { $gt: afterId ?? "" } },
      { orderBy: { id: "asc" }, limit },
    );
    return records.map((record) => this.toDomain(record));
  }

  async findLiveByImei(imei: string): Promise<Device | null> {
    const orm = await getFleetOrm(this.config.db);
    const record = await orm.em.fork().findOne(
      DeviceRecord,
      { imei: imei.trim(), lifecycleStatus: { $ne: "decommissioned" } },
      { orderBy: { createdAt: "asc" } },
    );
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

  async findProvisionRetryDue(now: Date, limit: number): Promise<Device[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      DeviceRecord,
      {
        provisionStatus: "failed",
        lifecycleStatus: { $ne: "decommissioned" },
        provisionNextAttemptAt: { $lte: now },
      },
      { orderBy: { provisionNextAttemptAt: "asc" }, limit },
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
      suspendedBy: record.suspendedBy === "tenant" || record.suspendedBy === "platform" ? record.suspendedBy : null,
      holdCause: record.holdCause === "non_payment" || record.holdCause === "tenant_manual" ? record.holdCause : null,
      traccarDeviceId: record.traccarDeviceId ?? null,
      provisionStatus:
        record.provisionStatus && isDeviceProvisionStatus(record.provisionStatus)
          ? record.provisionStatus
          : "pending",
      provisionAttempts: record.provisionAttempts ?? 0,
      provisionNextAttemptAt: record.provisionNextAttemptAt?.toISOString() ?? null,
      provisionError: record.provisionError ?? null,
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
    suspendedBy: device.suspendedBy,
    traccarDeviceId: device.traccarDeviceId,
    provisionStatus: device.provisionStatus,
    provisionAttempts: device.provisionAttempts,
    provisionNextAttemptAt: device.provisionNextAttemptAt ? new Date(device.provisionNextAttemptAt) : null,
    provisionError: device.provisionError,
    createdAt: new Date(device.createdAt),
    updatedAt: new Date(device.updatedAt),
  };
}
