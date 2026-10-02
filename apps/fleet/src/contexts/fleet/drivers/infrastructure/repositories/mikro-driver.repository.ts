import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  Driver,
  normalizeDriverStatus,
} from "../../domain/entities/driver.entity";
import type {
  DriverFilters,
  DriverRepository,
} from "../../domain/repositories/driver.repository";
import { DriverRecord, getFleetOrm } from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroDriverRepository implements DriverRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(driver: Driver): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();

    await em.upsert(DriverRecord, {
      id: driver.id,
      name: driver.name,
      phone: driver.phone || null,
      email: driver.email,
      licenseNumber: driver.licenseNumber,
      licenseExpiryDate: driver.licenseExpiryDate,
      tenantId: driver.tenantId,
      status: driver.status,
      communicationPreference: driver.communicationPreference,
      assignedVehicleId: driver.assignedVehicleId,
      whatsappNumber: driver.contactChannels.whatsappNumber,
      smsNumber: driver.contactChannels.smsNumber,
      voiceNumber: driver.contactChannels.voiceNumber,
      performanceScore: driver.performanceScore,
      performanceJobsScored: driver.performanceJobsScored,
      performanceScoredAt: driver.performanceScoredAt ? new Date(driver.performanceScoredAt) : null,
      updatedAt: new Date(),
    });
  }

  async findAll(filters?: DriverFilters): Promise<Driver[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      DriverRecord,
      {
        ...(filters?.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.assigned === undefined
          ? {}
          : filters.assigned
            ? { assignedVehicleId: { $ne: null } }
            : { assignedVehicleId: null }),
      },
      { orderBy: { createdAt: "asc" } },
    );

    const query = filters?.query?.trim().toLowerCase();
    const filtered = !query
      ? records
      : records.filter((record) =>
          [
            record.id,
            record.name,
            record.phone ?? "",
            record.email ?? "",
            record.licenseNumber,
            record.whatsappNumber ?? "",
            record.smsNumber ?? "",
            record.voiceNumber ?? "",
          ].some((value) => value.toLowerCase().includes(query)),
        );

    return filtered.map((record) => this.toDomain(record));
  }

  async findById(id: string, tenantId: string): Promise<Driver | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DriverRecord, { id, tenantId });
    return record ? this.toDomain(record) : null;
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(DriverRecord, { id, tenantId });
  }

  async findByLicenseNumber(licenseNumber: string, tenantId: string): Promise<Driver | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DriverRecord, {
      licenseNumber: licenseNumber.trim().toUpperCase(),
      tenantId: tenantId.trim(),
    });
    return record ? this.toDomain(record) : null;
  }

  async findByAssignedVehicleId(vehicleId: string, tenantId: string): Promise<Driver | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DriverRecord, { assignedVehicleId: vehicleId, tenantId });
    return record ? this.toDomain(record) : null;
  }

  async findByWhatsappNumber(whatsappNumber: string, tenantId: string): Promise<Driver | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DriverRecord, { whatsappNumber, tenantId });
    return record ? this.toDomain(record) : null;
  }

  async findByNumbersAcrossTenants(numbers: string[], limit: number): Promise<Driver[]> {
    if (numbers.length === 0) return [];
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      DriverRecord,
      {
        $or: [
          { phone: { $in: numbers } },
          { whatsappNumber: { $in: numbers } },
          { smsNumber: { $in: numbers } },
          { voiceNumber: { $in: numbers } },
        ],
      },
      { orderBy: { createdAt: "asc" }, limit },
    );
    return records.map((record) => this.toDomain(record));
  }

  private toDomain(record: DriverRecord) {
    return Driver.create({
      id: record.id,
      name: record.name,
      phone: record.phone ?? "",
      email: record.email ?? null,
      licenseNumber: record.licenseNumber,
      licenseExpiryDate: record.licenseExpiryDate ?? null,
      tenantId: record.tenantId,
      status: normalizeDriverStatus(record.status as never) ?? "active",
      communicationPreference:
        (record.communicationPreference as
          | "whatsapp"
          | "sms"
          | "email"
          | "voice"
          | null)
        ?? (record.email
          ? "email"
          : record.whatsappNumber
            ? "whatsapp"
            : record.smsNumber
              ? "sms"
              : record.voiceNumber
                ? "voice"
                : "whatsapp"),
      assignedVehicleId: record.assignedVehicleId ?? null,
      contactChannels: {
        whatsappNumber: record.whatsappNumber ?? null,
        smsNumber: record.smsNumber ?? null,
        voiceNumber: record.voiceNumber ?? null,
      },
      performanceScore: record.performanceScore ?? null,
      performanceJobsScored: record.performanceJobsScored ?? null,
      performanceScoredAt: record.performanceScoredAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}
