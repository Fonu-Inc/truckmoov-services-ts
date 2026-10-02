import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import type { FuelEfficiencyThreshold, FuelThresholdRepository } from "../domain/repositories/fuel-threshold.repository";
import { FleetFuelThresholdRecord, getFleetOrm } from "../../shared/infrastructure/persistence/fleet-orm";

const toThreshold = (row: FleetFuelThresholdRecord): FuelEfficiencyThreshold => ({
  vehicleType: row.vehicleType,
  minKmPerLiter: Number(row.minKmPerLiter),
});

@Injectable()
export class MikroFuelThresholdRepository implements FuelThresholdRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async upsert(tenantId: string, threshold: FuelEfficiencyThreshold): Promise<void> {
    const em = await this.em();
    await em.upsert(FleetFuelThresholdRecord, {
      id: `${tenantId}:${threshold.vehicleType}`,
      tenantId,
      vehicleType: threshold.vehicleType,
      minKmPerLiter: threshold.minKmPerLiter,
      updatedAt: new Date(),
    });
  }

  async findOne(tenantId: string, vehicleType: string): Promise<FuelEfficiencyThreshold | null> {
    const em = await this.em();
    const row = await em.findOne(FleetFuelThresholdRecord, { tenantId, vehicleType });
    return row ? toThreshold(row) : null;
  }

  async findAll(tenantId: string): Promise<FuelEfficiencyThreshold[]> {
    const em = await this.em();
    const rows = await em.find(FleetFuelThresholdRecord, { tenantId }, { orderBy: { vehicleType: "asc" } });
    return rows.map(toThreshold);
  }

  async delete(tenantId: string, vehicleType: string): Promise<boolean> {
    const em = await this.em();
    return (await em.nativeDelete(FleetFuelThresholdRecord, { tenantId, vehicleType })) > 0;
  }

  private async em() {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork();
  }
}
