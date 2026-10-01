import { Inject, Injectable } from "@nestjs/common";
import { FUEL_RECORD_REPOSITORY, type FuelRecordFilters, type FuelRecordRepository } from "../domain/repositories/fuel-record.repository";
import { FLEET_RUNTIME, type FleetRuntime } from "../../shared/domain/ports/fleet-runtime.port";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../drivers/domain/repositories/driver.repository";
import { toFuelRecordOutput } from "./fuel-record-output";

@Injectable()
export class ListFuelRecordsUseCase {
  constructor(
    @Inject(FUEL_RECORD_REPOSITORY) private readonly repo: FuelRecordRepository,
    @Inject(FLEET_RUNTIME) private readonly runtime: FleetRuntime,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly driverRepo: DriverRepository,
  ) {}

  async execute(filters: Omit<FuelRecordFilters, "tenantId"> & { tenantId?: string }) {
    const tenantId = filters.tenantId ?? this.runtime.getDefaultTenantId();
    const records = await this.repo.findAll({
      ...filters,
      tenantId,
    });

    return Promise.all(records.map((record) => toFuelRecordOutput(record, tenantId, this.vehicleRepo, this.driverRepo)));
  }
}
