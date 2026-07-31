import { Inject, Injectable } from "@nestjs/common";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../../vehicles/domain/repositories/vehicle.repository";
import type { DeviceLifecycleStatus } from "../../domain/entities/device.entity";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import {
  DEVICE_IDENTITY_EVENT_PUBLISHER,
  type DeviceIdentityEventPublisher,
} from "../../domain/ports/device-identity-event.publisher";
import {
  TRACCAR_DEVICE_PROVISIONER,
  type TraccarDeviceProvisioner,
} from "../../domain/ports/traccar-device.port";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";
import { emitDeviceIdentity } from "./device-identity-emit";

export type SetDeviceLifecycleStatusCommand = {
  id: string;
  tenantId: string;
  lifecycleStatus: DeviceLifecycleStatus;
};

@Injectable()
export class SetDeviceLifecycleStatusUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(TRACCAR_DEVICE_PROVISIONER)
    private readonly traccar: TraccarDeviceProvisioner,
    @Inject(DEVICE_IDENTITY_EVENT_PUBLISHER)
    private readonly identityPublisher: DeviceIdentityEventPublisher,
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

    if (command.lifecycleStatus !== "decommissioned") {
      await this.deviceRepository.save(updatedDevice);
      return updatedDevice.toPrimitives();
    }

    // Decommissioning detaches the mirrored GPS snapshot from the fleet vehicle aggregate,
    // retires the device from Traccar, and clears provisioning state so the persisted row
    // never reports a dangling traccarDeviceId after removal.
    if (device.vehicleId) {
      const vehicle = await this.vehicleRepository.findById(device.vehicleId, command.tenantId);
      if (vehicle && vehicle.gpsDevice?.imei === device.imei) {
        await this.vehicleRepository.save(vehicle.clearGpsDevice());
      }
    }
    await this.deregisterFromTraccar(device.traccarDeviceId);
    const retired = updatedDevice.withProvisioning({ traccarDeviceId: null, provisionStatus: "pending" });
    await this.deviceRepository.save(retired);
    await emitDeviceIdentity(this.identityPublisher, retired, "decommissioned");

    return retired.toPrimitives();
  }

  private async deregisterFromTraccar(traccarDeviceId: string | null): Promise<void> {
    if (!traccarDeviceId) {
      return;
    }
    try {
      await this.traccar.deregister(traccarDeviceId);
    } catch {
      // best-effort: a stale Traccar record never blocks decommissioning.
    }
  }
}
