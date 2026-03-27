import { Inject, Injectable } from "@nestjs/common";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../../vehicles/domain/repositories/vehicle.repository";
import { buildVehicleGpsSnapshot } from "./device-vehicle-sync";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";

export type UpdateDeviceCommand = {
  id: string;
  imei?: string;
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
  ) {}

  async execute(command: UpdateDeviceCommand) {
    const device = await this.deviceRepository.findById(command.id);
    if (!device) {
      throw new DeviceNotFoundError(command.id);
    }

    if (command.imei && command.imei !== device.imei) {
      const conflict = await this.deviceRepository.findByImei(command.imei, device.tenantId);
      if (conflict && conflict.id !== device.id) {
        throw new FleetRuleError(`device with IMEI ${command.imei} already exists`);
      }
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

    return updatedDevice.toPrimitives();
  }
}
