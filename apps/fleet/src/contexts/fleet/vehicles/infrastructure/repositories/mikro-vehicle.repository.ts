import { Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { Vehicle } from "../../domain/entities/vehicle.entity";
import type { VehicleRepository } from "../../domain/repositories/vehicle.repository";
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
      updatedAt: new Date(),
    });
  }

  async findAll(): Promise<Vehicle[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(VehicleRecord, {}, { orderBy: { createdAt: "asc" } });
    return records.map((record) => this.toDomain(record));
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

  private toDomain(record: VehicleRecord) {
    return Vehicle.create({
      id: record.id,
      plateNumber: record.plateNumber,
      model: record.model,
      tenantId: record.tenantId,
    });
  }
}
