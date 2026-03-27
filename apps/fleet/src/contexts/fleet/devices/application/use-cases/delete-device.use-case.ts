import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../../vehicles/domain/repositories/vehicle.repository";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";

@Injectable()
export class DeleteDeviceUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
  ) {}

  async execute(id: string) {
    const device = await this.deviceRepository.findById(id);
    if (!device) {
      throw new DeviceNotFoundError(id);
    }

    if (device.vehicleId) {
      const vehicle = await this.vehicleRepository.findById(device.vehicleId);
      if (vehicle && vehicle.gpsDevice?.imei === device.imei) {
        await this.vehicleRepository.save(vehicle.clearGpsDevice());
      }
    }

    await this.deviceRepository.deleteById(id);
    return device.toPrimitives();
  }
}
