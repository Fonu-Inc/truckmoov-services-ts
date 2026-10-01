import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../../vehicles/domain/repositories/vehicle.repository";
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
import { detachFromVehicle } from "./suspend-device.use-cases";

/**
 * Retires a device permanently, on the platform's instruction. Tenants can
 * only mark a device faulty: decommissioning is one-way, so it is not theirs
 * to do by mistake.
 *
 * The vehicle stops showing it, Traccar forgets it, and provisioning is reset
 * so the row never reports a dangling traccarDeviceId.
 */
@Injectable()
export class DecommissionDeviceUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(TRACCAR_DEVICE_PROVISIONER) private readonly traccar: TraccarDeviceProvisioner,
    @Inject(DEVICE_IDENTITY_EVENT_PUBLISHER)
    private readonly identityPublisher: DeviceIdentityEventPublisher,
  ) {}

  async execute(deviceId: string) {
    const device = await this.devices.findByIdAcrossTenants(deviceId);
    if (!device) throw new DeviceNotFoundError(deviceId);

    const retired = device
      .decommission()
      .withProvisioning({ traccarDeviceId: null, provisionStatus: "pending" });
    await detachFromVehicle(this.vehicles, device);
    await this.deregisterFromTraccar(device.traccarDeviceId);
    await this.devices.save(retired);
    await emitDeviceIdentity(this.identityPublisher, retired, "decommissioned");

    return retired.toPrimitives();
  }

  private async deregisterFromTraccar(traccarDeviceId: string | null): Promise<void> {
    if (!traccarDeviceId) return;
    try {
      await this.traccar.deregister(traccarDeviceId);
    } catch {
      // A stale Traccar record never blocks decommissioning.
    }
  }
}
