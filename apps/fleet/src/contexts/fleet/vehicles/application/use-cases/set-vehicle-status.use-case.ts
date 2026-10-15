import { Inject, Injectable } from "@nestjs/common";
import { QuotaService } from "../../../../../quota.service";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../../drivers/domain/repositories/driver.repository";
import type { FleetAssetStatus } from "../../../shared/domain/fleet-status";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";
import { assertRoomForActiveVehicles } from "./create-vehicle.use-case";

export type SetVehicleStatusCommand = {
  id: string;
  tenantId: string;
  status: FleetAssetStatus;
};

@Injectable()
export class SetVehicleStatusUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
    @Inject(QuotaService)
    private readonly quotaService: QuotaService,
  ) {}

  async execute(command: SetVehicleStatusCommand) {
    const vehicle = await this.vehicleRepository.findById(command.id, command.tenantId);
    if (!vehicle) {
      throw new VehicleNotFoundError(command.id);
    }
    if (command.status === "active" && vehicle.status !== "active") {
      await assertRoomForActiveVehicles(this.vehicleRepository, this.quotaService, command.tenantId, 1);
    }

    const updatedVehicle = vehicle.setStatus(command.status);
    await this.vehicleRepository.save(updatedVehicle);

    // Deactivation removes assignment to keep dispatch results aligned with availability.
    if (command.status === "inactive" && vehicle.assignedDriverId) {
      const driver = await this.driverRepository.findById(vehicle.assignedDriverId, command.tenantId);
      if (driver) {
        await this.driverRepository.save(driver.unassignVehicle());
      }
    }

    return updatedVehicle.toPrimitives();
  }
}
