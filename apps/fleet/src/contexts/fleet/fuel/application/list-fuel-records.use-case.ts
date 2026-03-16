import { Inject, Injectable } from "@nestjs/common";
import { FUEL_RECORD_REPOSITORY, type FuelRecordFilters, type FuelRecordRepository } from "../domain/repositories/fuel-record.repository";
import { FLEET_RUNTIME, type FleetRuntime } from "../../shared/domain/ports/fleet-runtime.port";

@Injectable()
export class ListFuelRecordsUseCase {
  constructor(
    @Inject(FUEL_RECORD_REPOSITORY) private readonly repo: FuelRecordRepository,
    @Inject(FLEET_RUNTIME) private readonly runtime: FleetRuntime,
  ) {}

  async execute(filters: Omit<FuelRecordFilters, "tenantId"> & { tenantId?: string }) {
    return this.repo.findAll({
      ...filters,
      tenantId: filters.tenantId ?? this.runtime.getDefaultTenantId(),
    });
  }
}
