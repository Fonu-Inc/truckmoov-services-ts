import { Inject, Injectable } from "@nestjs/common";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../drivers/domain/repositories/driver.repository";
import { ALERT_REPOSITORY, type AlertRepository } from "../../alerts/domain/alert.repository";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "../../fuel/domain/repositories/fuel-record.repository";
import { toCsv } from "../../../../utils/csv";

export type ExportEntity = "jobs" | "vehicles" | "drivers" | "alerts" | "fuel";

@Injectable()
export class ExportUseCase {
  constructor(
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly driverRepo: DriverRepository,
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: AlertRepository,
    @Inject(FUEL_RECORD_REPOSITORY) private readonly fuelRepo: FuelRecordRepository,
  ) {}

  async toCsv(entity: ExportEntity, tenantId: string): Promise<string> {
    switch (entity) {
      case "jobs": {
        const rows = await this.dispatchJobs.listJobs(tenantId);
        return toCsv(rows as unknown as Record<string, unknown>[]);
      }
      case "vehicles": {
        const rows = await this.vehicleRepo.findAll({ tenantId });
        return toCsv(rows.map((v) => ({ ...v.toPrimitives(), gpsDevice: v.gpsDevice?.imei ?? null })));
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
      case "fuel": {
        const rows = await this.fuelRepo.findAll({ tenantId });
        return toCsv(rows.map((r) => ({ ...r.toPrimitives(), auditTrail: JSON.stringify(r.auditTrail) })));
      }
    }
  }
}
