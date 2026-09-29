import { Inject, Injectable } from "@nestjs/common";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "../domain/repositories/fuel-record.repository";
import { FuelRecordNotFoundError } from "../domain/errors/fuel-record-not-found.error";

@Injectable()
export class DeleteFuelRecordUseCase {
  constructor(@Inject(FUEL_RECORD_REPOSITORY) private readonly repo: FuelRecordRepository) {}

  async execute(
    id: string,
    tenantId: string,
    deletedBy: string,
    allowedVehicleIds?: ReadonlySet<string> | null,
  ): Promise<void> {
    const record = await this.repo.findById(id, tenantId);
    // Another owner's record reads as missing, not as forbidden.
    if (!record || (allowedVehicleIds && !allowedVehicleIds.has(record.vehicleId))) {
      throw new FuelRecordNotFoundError(id);
    }
    await this.repo.save(record.softDelete(deletedBy));
  }
}
