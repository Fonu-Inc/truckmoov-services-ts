import { Inject, Injectable } from "@nestjs/common";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";
import type { FleetAssetStatus } from "../../../shared/domain/fleet-status";
import type { FleetVehicleType, FleetFuelType } from "../../domain/entities/vehicle.entity";

export type UpdateVehicleCommand = {
  id: string;
  registrationNumber?: string;
  plateNumber?: string;
  vin?: string | null;
  make?: string | null;
  model?: string;
  year?: number | null;
  type?: FleetVehicleType | null;
  fuelType?: FleetFuelType | null;
  capacity?: number | null;
  tenantId?: string;
  status?: FleetAssetStatus;
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

    // Keep the same aliasing rule on updates so the UI never has to know about plateNumber.
    const updatedVehicle = existingVehicle.update({
      plateNumber: command.registrationNumber ?? command.plateNumber,
      vin: command.vin,
      make: command.make,
      model: command.model,
      year: command.year,
      type: command.type,
      fuelType: command.fuelType,
      capacity: command.capacity,
      tenantId: command.tenantId,
      status: command.status,
    });

    await this.vehicleRepository.save(updatedVehicle);
    return updatedVehicle.toPrimitives();
  }
}
