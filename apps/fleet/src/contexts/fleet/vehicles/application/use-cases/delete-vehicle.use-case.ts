import { Inject, Injectable } from "@nestjs/common";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";

@Injectable()
export class DeleteVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
  ) {}

  async execute(id: string) {
    const existingVehicle = await this.vehicleRepository.findById(id);
    if (!existingVehicle) {
      throw new VehicleNotFoundError(id);
    }

    await this.vehicleRepository.deleteById(id);
    return { deleted: true, id };
  }
}
