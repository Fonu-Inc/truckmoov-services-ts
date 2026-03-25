import { Inject, Injectable } from "@nestjs/common";
import { DriverNotFoundError } from "../../../drivers/domain/errors/driver-not-found.error";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../../drivers/domain/repositories/driver.repository";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";

export type AssignDriverToVehicleCommand = {
  vehicleId: string;
  driverId: string;
};

@Injectable()
export class AssignDriverToVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute(command: AssignDriverToVehicleCommand) {
    const vehicle = await this.vehicleRepository.findById(command.vehicleId);
    if (!vehicle) {
      throw new VehicleNotFoundError(command.vehicleId);
    }

    const driver = await this.driverRepository.findById(command.driverId);
    if (!driver) {
      throw new DriverNotFoundError(command.driverId);
    }

    if (vehicle.tenantId !== driver.tenantId) {
      throw new FleetRuleError("Driver and vehicle must belong to the same tenant");
    }
    if (vehicle.status !== "active") {
      throw new FleetRuleError("Inactive vehicles cannot receive new assignments");
    }
    if (!["active", "available"].includes(driver.status)) {
      throw new FleetRuleError(
        "Only active or available drivers can be assigned to vehicles",
      );
    }

    // Keep assignment links symmetric: every driver points to one vehicle and vice versa.
    // When either side is already assigned, we detach the previous pair before linking the new one.
    if (vehicle.assignedDriverId && vehicle.assignedDriverId !== driver.id) {
      const previousDriver = await this.driverRepository.findById(vehicle.assignedDriverId);
      if (previousDriver) {
        await this.driverRepository.save(previousDriver.unassignVehicle());
      }
    }

    if (driver.assignedVehicleId && driver.assignedVehicleId !== vehicle.id) {
      const previousVehicle = await this.vehicleRepository.findById(driver.assignedVehicleId);
      if (previousVehicle) {
        await this.vehicleRepository.save(previousVehicle.unassignDriver());
      }
    }

    const assignedVehicle = vehicle.assignDriver(driver.id);
    const assignedDriver = driver.assignVehicle(vehicle.id);

    await this.vehicleRepository.save(assignedVehicle);
    await this.driverRepository.save(assignedDriver);

    return {
      vehicle: assignedVehicle.toPrimitives(),
      driver: assignedDriver.toPrimitives(),
    };
  }
}
