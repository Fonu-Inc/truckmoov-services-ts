import { Inject, Injectable } from "@nestjs/common";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../../vehicles/domain/repositories/vehicle.repository";
import type { DeviceLifecycleStatus } from "../../domain/entities/device.entity";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";

export type SetDeviceLifecycleStatusCommand = {
  id: string;
  lifecycleStatus: DeviceLifecycleStatus;
};

@Injectable()
export class SetDeviceLifecycleStatusUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
  ) {}

  async execute(command: SetDeviceLifecycleStatusCommand) {
    const device = await this.deviceRepository.findById(command.id);
    if (!device) {
      throw new DeviceNotFoundError(command.id);
    }

    if (command.lifecycleStatus === "assigned") {
      throw new FleetRuleError("use the assignment endpoint to move a device into assigned state");
    }
    if (command.lifecycleStatus === device.lifecycleStatus) {
      return device.toPrimitives();
    }
    if (!device.canTransitionTo(command.lifecycleStatus)) {
      throw new FleetRuleError(
        `device cannot transition from ${device.lifecycleStatus} to ${command.lifecycleStatus}`,
      );
    }

    const updatedDevice = device.transitionTo(command.lifecycleStatus);
    await this.deviceRepository.save(updatedDevice);

    // Decommissioning must also detach the mirrored GPS snapshot from the fleet vehicle aggregate.
    if (command.lifecycleStatus === "decommissioned" && device.vehicleId) {
      const vehicle = await this.vehicleRepository.findById(device.vehicleId);
      if (vehicle && vehicle.gpsDevice?.imei === device.imei) {
        await this.vehicleRepository.save(vehicle.clearGpsDevice());
      }
    }

    return updatedDevice.toPrimitives();
  }
}
