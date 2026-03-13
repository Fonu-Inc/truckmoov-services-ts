import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { Driver } from "../../domain/entities/driver.entity";
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
      licenseNumber: driver.licenseNumber,
      tenantId: driver.tenantId,
      status: driver.status,
      assignedVehicleId: driver.assignedVehicleId,
      whatsappNumber: driver.contactChannels.whatsappNumber,
      smsNumber: driver.contactChannels.smsNumber,
      voiceNumber: driver.contactChannels.voiceNumber,
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
            record.licenseNumber,
            record.whatsappNumber ?? "",
            record.smsNumber ?? "",
            record.voiceNumber ?? "",
          ].some((value) => value.toLowerCase().includes(query)),
        );

    return filtered.map((record) => this.toDomain(record));
  }

  async findById(id: string): Promise<Driver | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DriverRecord, { id });
    return record ? this.toDomain(record) : null;
  }

  async deleteById(id: string): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(DriverRecord, { id });
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

  async findByAssignedVehicleId(vehicleId: string): Promise<Driver | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DriverRecord, {
      assignedVehicleId: vehicleId,
    });
    return record ? this.toDomain(record) : null;
  }

  private toDomain(record: DriverRecord) {
    return Driver.create({
      id: record.id,
      name: record.name,
      licenseNumber: record.licenseNumber,
      tenantId: record.tenantId,
      status: record.status === "inactive" ? "inactive" : "active",
      assignedVehicleId: record.assignedVehicleId ?? null,
      contactChannels: {
        whatsappNumber: record.whatsappNumber ?? null,
        smsNumber: record.smsNumber ?? null,
        voiceNumber: record.voiceNumber ?? null,
      },
    });
  }
}
