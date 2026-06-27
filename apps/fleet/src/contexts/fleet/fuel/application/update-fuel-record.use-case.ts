import { Inject, Injectable } from "@nestjs/common";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "../domain/repositories/fuel-record.repository";
import { FuelRecordNotFoundError } from "../domain/errors/fuel-record-not-found.error";
import type { FuelRecordProps } from "../domain/entities/fuel-record.entity";

export type UpdateFuelRecordCommand = {
  id: string;
  tenantId: string;
  updatedBy: string;
  liters?: number;
  pricePerLiter?: number;
  station?: string | null;
  odometer?: number | null;
  driverId?: string | null;
  vehicleType?: string | null;
  fuelType?: string | null;
};

@Injectable()
export class UpdateFuelRecordUseCase {
  constructor(@Inject(FUEL_RECORD_REPOSITORY) private readonly repo: FuelRecordRepository) {}

  async execute(cmd: UpdateFuelRecordCommand) {
    const record = await this.repo.findById(cmd.id, cmd.tenantId);
    if (!record) throw new FuelRecordNotFoundError(cmd.id);

    const updated = record.update(
      {
        liters: cmd.liters,
        pricePerLiter: cmd.pricePerLiter,
        station: cmd.station,
        odometer: cmd.odometer,
        driverId: cmd.driverId,
        vehicleType: cmd.vehicleType,
        fuelType: cmd.fuelType,
      } as Partial<Pick<FuelRecordProps, "liters" | "pricePerLiter" | "station" | "odometer" | "driverId" | "vehicleType" | "fuelType">>,
      cmd.updatedBy,
    );

    await this.repo.save(updated);
    return updated;
  }
}
