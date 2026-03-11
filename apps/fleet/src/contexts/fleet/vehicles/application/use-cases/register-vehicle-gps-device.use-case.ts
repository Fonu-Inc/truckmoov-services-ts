import { Inject, Injectable } from "@nestjs/common";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";

export type RegisterVehicleGpsDeviceCommand = {
  vehicleId: string;
  deviceId: string;
  provider: string;
  serialNumber: string;
  installedAt?: string;
};

@Injectable()
export class RegisterVehicleGpsDeviceUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
  ) {}

  async execute(command: RegisterVehicleGpsDeviceCommand) {
    const vehicle = await this.vehicleRepository.findById(command.vehicleId);
    if (!vehicle) {
      throw new VehicleNotFoundError(command.vehicleId);
    }

    const updatedVehicle = vehicle.registerGpsDevice({
      deviceId: command.deviceId,
      provider: command.provider,
      serialNumber: command.serialNumber,
      installedAt: command.installedAt ?? new Date().toISOString(),
    });

    await this.vehicleRepository.save(updatedVehicle);
    return updatedVehicle.toPrimitives();
  }
}
