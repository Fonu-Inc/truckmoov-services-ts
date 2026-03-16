import { Inject, Injectable } from "@nestjs/common";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "../domain/repositories/fuel-record.repository";
import { FuelRecordNotFoundError } from "../domain/errors/fuel-record-not-found.error";

@Injectable()
export class DeleteFuelRecordUseCase {
  constructor(@Inject(FUEL_RECORD_REPOSITORY) private readonly repo: FuelRecordRepository) {}

  async execute(id: string, tenantId: string, deletedBy: string): Promise<void> {
    const record = await this.repo.findById(id, tenantId);
    if (!record) throw new FuelRecordNotFoundError(id);
    await this.repo.save(record.softDelete(deletedBy));
  }
}
