import { Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { Driver } from "../../domain/entities/driver.entity";
import type { DriverRepository } from "../../domain/repositories/driver.repository";
import { DriverRecord, getFleetOrm } from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroDriverRepository implements DriverRepository {
  constructor(private readonly config: AppConfigService) {}

  async save(driver: Driver): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();

    await em.upsert(DriverRecord, {
      id: driver.id,
      name: driver.name,
      licenseNumber: driver.licenseNumber,
      tenantId: driver.tenantId,
      updatedAt: new Date(),
    });
  }

  async findAll(): Promise<Driver[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(DriverRecord, {}, { orderBy: { createdAt: "asc" } });
    return records.map((record) => this.toDomain(record));
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

  private toDomain(record: DriverRecord) {
    return Driver.create({
      id: record.id,
      name: record.name,
      licenseNumber: record.licenseNumber,
      tenantId: record.tenantId,
    });
  }
}
