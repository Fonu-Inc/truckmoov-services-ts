import { Inject, Injectable } from "@nestjs/common";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";
import type { FleetAssetStatus } from "../../../shared/domain/fleet-status";
import type { FleetVehicleType, FleetFuelType } from "../../domain/entities/vehicle.entity";
import type { VehicleCapacityUnit } from "../../domain/vehicle-capacity";

export type UpdateVehicleCommand = {
  id: string;
  tenantId: string;
  registrationNumber?: string;
  plateNumber?: string;
  vin?: string | null;
  make?: string | null;
  model?: string;
  year?: number | null;
  type?: FleetVehicleType | null;
  fuelType?: FleetFuelType | null;
  capacity?: number | null;
  capacityUnit?: VehicleCapacityUnit | null;
  status?: FleetAssetStatus;
};

@Injectable()
export class UpdateVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
  ) {}

  async execute(command: UpdateVehicleCommand) {
    const existingVehicle = await this.vehicleRepository.findById(command.id, command.tenantId);
    if (!existingVehicle) {
      throw new VehicleNotFoundError(command.id);
    }

    // Keep the same aliasing rule on updates so the UI never has to know about plateNumber.
    // tenantId is never taken from the command here — it's only used above to
    // scope the lookup. Passing it through would let a caller reassign this
    // vehicle into their own tenant.
    const updatedVehicle = existingVehicle.update({
      plateNumber: command.registrationNumber ?? command.plateNumber,
      vin: command.vin,
      make: command.make,
      model: command.model,
      year: command.year,
      type: command.type,
      fuelType: command.fuelType,
      capacity: command.capacity,
      capacityUnit: command.capacityUnit,
      status: command.status,
    });

    await this.vehicleRepository.save(updatedVehicle);
    return updatedVehicle.toPrimitives();
  }
}
