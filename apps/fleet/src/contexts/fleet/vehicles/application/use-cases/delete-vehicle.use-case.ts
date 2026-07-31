import { Inject, Injectable } from "@nestjs/common";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../../drivers/domain/repositories/driver.repository";
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
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute(id: string, tenantId: string) {
    const existingVehicle = await this.vehicleRepository.findById(id, tenantId);
    if (!existingVehicle) {
      throw new VehicleNotFoundError(id);
    }

    if (existingVehicle.assignedDriverId) {
      const driver = await this.driverRepository.findById(existingVehicle.assignedDriverId, tenantId);
      if (driver) {
        await this.driverRepository.save(driver.unassignVehicle());
      }
    }

    await this.vehicleRepository.deleteById(id, tenantId);
    return { deleted: true, id };
  }
}
