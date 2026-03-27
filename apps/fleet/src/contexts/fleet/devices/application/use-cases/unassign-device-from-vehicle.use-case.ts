import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../../vehicles/domain/repositories/vehicle.repository";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";

@Injectable()
export class UnassignDeviceFromVehicleUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
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

    return updatedDevice.toPrimitives();
  }
}
