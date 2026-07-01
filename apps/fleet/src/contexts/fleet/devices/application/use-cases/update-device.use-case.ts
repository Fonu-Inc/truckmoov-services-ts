import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../../vehicles/domain/repositories/vehicle.repository";
import { buildVehicleGpsSnapshot } from "./device-vehicle-sync";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import {
  DEVICE_IDENTITY_EVENT_PUBLISHER,
  type DeviceIdentityEventPublisher,
} from "../../domain/ports/device-identity-event.publisher";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";
import { emitDeviceIdentity } from "./device-identity-emit";

export type UpdateDeviceCommand = {
  id: string;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  signalStrength?: number | null;
  batteryLevel?: number | null;
  lastSeen?: string | null;
};

@Injectable()
export class UpdateDeviceUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(DEVICE_IDENTITY_EVENT_PUBLISHER)
    private readonly identityPublisher: DeviceIdentityEventPublisher,
  ) {}

  async execute(command: UpdateDeviceCommand) {
    const device = await this.deviceRepository.findById(command.id);
    if (!device) {
      throw new DeviceNotFoundError(command.id);
    }

    const updatedDevice = device.update(command);
    await this.deviceRepository.save(updatedDevice);

    if (updatedDevice.vehicleId) {
      const vehicle = await this.vehicleRepository.findById(updatedDevice.vehicleId);
      if (vehicle && vehicle.gpsDevice?.imei === device.imei) {
        await this.vehicleRepository.save(
          vehicle.registerGpsDevice(
            buildVehicleGpsSnapshot(
              updatedDevice,
              vehicle.gpsDevice?.installedAt ?? updatedDevice.assignedAt,
            ),
          ),
        );
      }
    }

    await emitDeviceIdentity(this.identityPublisher, updatedDevice, "updated");
    return updatedDevice.toPrimitives();
  }
}
