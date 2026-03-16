import { Inject, Injectable } from "@nestjs/common";
import { JOB_REPOSITORY, type JobRepository } from "../../jobs/domain/repositories/job.repository";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../drivers/domain/repositories/driver.repository";
import { ALERT_REPOSITORY, type AlertRepository } from "../../alerts/domain/alert.repository";
import { toCsv } from "../../../../utils/csv";

export type ExportEntity = "jobs" | "vehicles" | "drivers" | "alerts";

@Injectable()
export class ExportUseCase {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobRepo: JobRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly driverRepo: DriverRepository,
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: AlertRepository,
  ) {}

  async toCsv(entity: ExportEntity, tenantId: string): Promise<string> {
    switch (entity) {
      case "jobs": {
        const rows = await this.jobRepo.findAll({ tenantId });
        return toCsv(rows.map((j) => j.toPrimitives()));
      }
      case "vehicles": {
        const rows = await this.vehicleRepo.findAll({ tenantId });
        return toCsv(rows.map((v) => ({ ...v.toPrimitives(), gpsDevice: v.gpsDevice?.deviceId ?? null })));
      }
      case "drivers": {
        const rows = await this.driverRepo.findAll({ tenantId });
        return toCsv(rows.map((d) => d.toPrimitives()));
      }
      case "alerts": {
        const rows = await this.alertRepo.findAll(tenantId);
        return toCsv(rows.map((a) => ({
          ...a.toPrimitives(),
          triggeredAt: a.triggeredAt.toISOString(),
          acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
          resolvedAt: a.resolvedAt?.toISOString() ?? null,
          details: JSON.stringify(a.details),
        })));
      }
    }
  }
}
