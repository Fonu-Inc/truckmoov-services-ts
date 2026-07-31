import { Inject, Injectable } from "@nestjs/common";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../../drivers/domain/repositories/driver.repository";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";

@Injectable()
export class UnassignDriverFromVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute(vehicleId: string, tenantId: string) {
    const vehicle = await this.vehicleRepository.findById(vehicleId, tenantId);
    if (!vehicle) {
      throw new VehicleNotFoundError(vehicleId);
    }

    const detachedVehicle = vehicle.unassignDriver();
    await this.vehicleRepository.save(detachedVehicle);

    if (vehicle.assignedDriverId) {
      const driver = await this.driverRepository.findById(vehicle.assignedDriverId, tenantId);
      if (driver) {
        await this.driverRepository.save(driver.unassignVehicle());
      }
    }

    return detachedVehicle.toPrimitives();
  }
}
