import { Inject, Injectable } from "@nestjs/common";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import type { DeviceLifecycleStatus } from "../../domain/entities/device.entity";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";

export type SetDeviceLifecycleStatusCommand = {
  id: string;
  tenantId: string;
  lifecycleStatus: DeviceLifecycleStatus;
};

/**
 * The tenant's lifecycle moves. Decommissioning is not one of them: it is
 * permanent and platform-only (DecommissionDeviceUseCase), and suspension has
 * its own route.
 */
@Injectable()
export class SetDeviceLifecycleStatusUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
  ) {}

  async execute(command: SetDeviceLifecycleStatusCommand) {
    const device = await this.deviceRepository.findById(command.id, command.tenantId);
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
    return updatedDevice.toPrimitives();
  }
}
