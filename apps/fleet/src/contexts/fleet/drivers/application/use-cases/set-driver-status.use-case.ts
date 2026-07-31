import { Inject, Injectable } from "@nestjs/common";
import { DriverNotFoundError } from "../../domain/errors/driver-not-found.error";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../domain/repositories/driver.repository";
import type { FleetDriverStatus } from "../../domain/entities/driver.entity";
import { isDriverUnavailableStatus } from "../../domain/entities/driver.entity";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../../vehicles/domain/repositories/vehicle.repository";

export type SetDriverStatusCommand = {
  id: string;
  tenantId: string;
  status: FleetDriverStatus;
};

@Injectable()
export class SetDriverStatusUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
  ) {}

  async execute(command: SetDriverStatusCommand) {
    const driver = await this.driverRepository.findById(command.id, command.tenantId);
    if (!driver) {
      throw new DriverNotFoundError(command.id);
    }

    const updatedDriver = driver.setStatus(command.status);
    await this.driverRepository.save(updatedDriver);

    if (isDriverUnavailableStatus(command.status) && driver.assignedVehicleId) {
      const vehicle = await this.vehicleRepository.findById(driver.assignedVehicleId, command.tenantId);
      if (vehicle) {
        await this.vehicleRepository.save(vehicle.unassignDriver());
      }
    }

    return updatedDriver.toPrimitives();
  }
}
