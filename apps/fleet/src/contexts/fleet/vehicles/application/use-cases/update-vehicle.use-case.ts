import { Inject, Injectable } from "@nestjs/common";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";

export type UpdateVehicleCommand = {
  id: string;
  plateNumber?: string;
  model?: string;
  tenantId?: string;
};

@Injectable()
export class UpdateVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
  ) {}

  async execute(command: UpdateVehicleCommand) {
    const existingVehicle = await this.vehicleRepository.findById(command.id);
    if (!existingVehicle) {
      throw new VehicleNotFoundError(command.id);
    }

    const updatedVehicle = existingVehicle.update({
      plateNumber: command.plateNumber,
      model: command.model,
      tenantId: command.tenantId,
    });

    await this.vehicleRepository.save(updatedVehicle);
    return updatedVehicle.toPrimitives();
  }
}
