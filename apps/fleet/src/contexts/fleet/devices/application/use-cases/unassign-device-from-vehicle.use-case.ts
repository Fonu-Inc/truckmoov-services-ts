import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../../vehicles/domain/repositories/vehicle.repository";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import {
  DEVICE_IDENTITY_EVENT_PUBLISHER,
  type DeviceIdentityEventPublisher,
} from "../../domain/ports/device-identity-event.publisher";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";
import { emitDeviceIdentity } from "./device-identity-emit";

@Injectable()
export class UnassignDeviceFromVehicleUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(DEVICE_IDENTITY_EVENT_PUBLISHER)
    private readonly identityPublisher: DeviceIdentityEventPublisher,
  ) {}

  async execute(deviceId: string) {
    const device = await this.deviceRepository.findById(deviceId);
    if (!device) {
      throw new DeviceNotFoundError(deviceId);
    }

    const vehicle = device.vehicleId
      ? await this.vehicleRepository.findById(device.vehicleId)
      : null;

    const updatedDevice = device.unassignFromVehicle();
    await this.deviceRepository.save(updatedDevice);

    if (vehicle && vehicle.gpsDevice?.imei === device.imei) {
      await this.vehicleRepository.save(vehicle.clearGpsDevice());
    }

    await emitDeviceIdentity(this.identityPublisher, updatedDevice, "unassigned");
    return updatedDevice.toPrimitives();
  }
}
