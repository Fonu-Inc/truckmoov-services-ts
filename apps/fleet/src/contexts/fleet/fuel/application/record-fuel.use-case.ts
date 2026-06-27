import { Inject, Injectable } from "@nestjs/common";
import { FuelRecord } from "../domain/entities/fuel-record.entity";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "../domain/repositories/fuel-record.repository";
import { FLEET_RUNTIME, type FleetRuntime } from "../../shared/domain/ports/fleet-runtime.port";
import { TriggerAlertUseCase } from "../../alerts/application/trigger-alert.use-case";
import { FuelThresholdService } from "./fuel-threshold.service";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";

export type RecordFuelCommand = {
  tenantId?: string;
  vehicleId: string;
  driverId?: string | null;
  vehicleType?: string | null;
  fuelType?: string | null;
  liters: number;
  pricePerLiter: number;
  station?: string | null;
  odometer?: number | null;
  recordedBy: string;
};

@Injectable()
export class RecordFuelUseCase {
  constructor(
    @Inject(FUEL_RECORD_REPOSITORY) private readonly repo: FuelRecordRepository,
    @Inject(FLEET_RUNTIME) private readonly runtime: FleetRuntime,
    private readonly triggerAlert: TriggerAlertUseCase,
    private readonly thresholds: FuelThresholdService,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
  ) {}

  async execute(cmd: RecordFuelCommand): Promise<FuelRecord> {
    const tenantId = cmd.tenantId ?? this.runtime.getDefaultTenantId();
    const now = new Date().toISOString();
    const fuelType = cmd.fuelType ?? (await this.resolveVehicleFuelType(cmd.vehicleId));

    const record = FuelRecord.create({
      id: this.runtime.generateId(),
      tenantId,
      vehicleId: cmd.vehicleId,
      driverId: cmd.driverId ?? null,
      vehicleType: cmd.vehicleType ?? null,
      fuelType,
      liters: cmd.liters,
      pricePerLiter: cmd.pricePerLiter,
      station: cmd.station ?? null,
      odometer: cmd.odometer ?? null,
      recordedAt: now,
      recordedBy: cmd.recordedBy,
      deletedAt: null,
      auditTrail: [{ at: now, by: cmd.recordedBy, action: "create" }],
    });

    await this.repo.save(record);
    await this.checkEfficiencyAlert(tenantId, cmd.vehicleId, cmd.vehicleType ?? null);

    return record;
  }

  private async resolveVehicleFuelType(vehicleId: string): Promise<string | null> {
    try {
      const vehicle = await this.vehicleRepo.findById(vehicleId);
      return vehicle?.fuelType ?? null;
    } catch {
      return null;
    }
  }

  private async checkEfficiencyAlert(tenantId: string, vehicleId: string, vehicleType: string | null): Promise<void> {
    const threshold = this.thresholds.get(vehicleType ?? "default");
    if (!threshold) return;

    const records = await this.repo.findAll({ tenantId, vehicleId });
    const withOdometer = records
      .filter((r) => r.odometer !== null)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

    if (withOdometer.length < 2) return;

    const prev = withOdometer[withOdometer.length - 2];
    const curr = withOdometer[withOdometer.length - 1];
    const distanceKm = curr.odometer! - prev.odometer!;

    if (distanceKm <= 0 || curr.liters <= 0) return;

    const kmPerLiter = distanceKm / curr.liters;
    if (kmPerLiter < threshold.minKmPerLiter) {
      await this.triggerAlert.execute({
        id: this.runtime.generateId(),
        tenantId,
        type: "low_fuel_efficiency",
        severity: "medium",
        vehicleId,
        details: {
          kmPerLiter: +kmPerLiter.toFixed(2),
          threshold: threshold.minKmPerLiter,
          vehicleType: vehicleType ?? "default",
        },
      });
    }
  }
}
