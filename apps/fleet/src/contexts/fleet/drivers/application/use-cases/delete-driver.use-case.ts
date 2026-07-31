import { Inject, Injectable } from "@nestjs/common";
import { DriverNotFoundError } from "../../domain/errors/driver-not-found.error";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../domain/repositories/driver.repository";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../../vehicles/domain/repositories/vehicle.repository";

@Injectable()
export class DeleteDriverUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
  ) {}

  async execute(id: string, tenantId: string) {
    const existingDriver = await this.driverRepository.findById(id, tenantId);
    if (!existingDriver) {
      throw new DriverNotFoundError(id);
    }

    if (existingDriver.assignedVehicleId) {
      const vehicle = await this.vehicleRepository.findById(existingDriver.assignedVehicleId, tenantId);
      if (vehicle) {
        await this.vehicleRepository.save(vehicle.unassignDriver());
      }
    }

    await this.driverRepository.deleteById(id, tenantId);
    return { deleted: true, id };
  }
}
