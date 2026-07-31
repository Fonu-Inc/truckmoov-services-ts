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

@Injectable()
export class DeleteDeviceUseCase {
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

  async execute(id: string, tenantId: string) {
    const device = await this.deviceRepository.findById(id, tenantId);
    if (!device) {
      throw new DeviceNotFoundError(id);
    }

    if (device.vehicleId) {
      const vehicle = await this.vehicleRepository.findById(device.vehicleId, tenantId);
      if (vehicle && vehicle.gpsDevice?.imei === device.imei) {
        await this.vehicleRepository.save(vehicle.clearGpsDevice());
      }
    }

    await this.deviceRepository.deleteById(id, tenantId);
    await this.deregisterFromTraccar(device.traccarDeviceId);
    await emitDeviceIdentity(this.identityPublisher, device, "deleted");
    return device.toPrimitives();
  }

  private async deregisterFromTraccar(traccarDeviceId: string | null): Promise<void> {
    if (!traccarDeviceId) {
      return;
    }
    try {
      await this.traccar.deregister(traccarDeviceId);
    } catch {
      // best-effort: a stale Traccar record is reconciled out-of-band, never blocks delete.
    }
  }
}
