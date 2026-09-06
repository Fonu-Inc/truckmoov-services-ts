import { Inject, Injectable } from "@nestjs/common";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import type { Device } from "../../domain/entities/device.entity";
import {
  DEVICE_IDENTITY_EVENT_PUBLISHER,
  type DeviceIdentityEventPublisher,
} from "../../domain/ports/device-identity-event.publisher";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../../vehicles/domain/repositories/vehicle.repository";
import { emitDeviceIdentity } from "./device-identity-emit";

/**
 * Takes a device out of service on the platform's instruction.
 *
 * Cross-tenant on purpose: an administrator suspending a device knows the
 * device, not the tenant. The rule itself lives on the entity, so suspension
 * behaves the same however it is reached.
 */
@Injectable()
export class SuspendDeviceUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(DEVICE_IDENTITY_EVENT_PUBLISHER)
    private readonly identityPublisher: DeviceIdentityEventPublisher,
  ) {}

  async execute(deviceId: string, reason: string | null) {
    const device = await this.devices.findByIdAcrossTenants(deviceId);
    if (!device) throw new DeviceNotFoundError(deviceId);

    const suspended = device.suspend(reason);
    await this.devices.save(suspended);
    await this.detachFromVehicle(device);
    await emitDeviceIdentity(this.identityPublisher, suspended, "updated");

    return suspended.toPrimitives();
  }

  /**
   * The vehicle stops showing this device as its tracker. Leaving the snapshot
   * behind would keep a stale last-seen on the vehicle for a device that is no
   * longer allowed to report.
   */
  private async detachFromVehicle(device: Device): Promise<void> {
    if (!device.vehicleId) return;
    const vehicle = await this.vehicles.findById(device.vehicleId, device.tenantId);
    if (!vehicle || vehicle.gpsDevice?.imei !== device.imei) return;
    await this.vehicles.save(vehicle.clearGpsDevice());
  }
}

@Injectable()
export class ReinstateDeviceUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(DEVICE_IDENTITY_EVENT_PUBLISHER)
    private readonly identityPublisher: DeviceIdentityEventPublisher,
  ) {}

  async execute(deviceId: string) {
    const device = await this.devices.findByIdAcrossTenants(deviceId);
    if (!device) throw new DeviceNotFoundError(deviceId);

    const reinstated = device.reinstate();
    await this.devices.save(reinstated);
    await emitDeviceIdentity(this.identityPublisher, reinstated, "updated");

    return reinstated.toPrimitives();
  }
}
