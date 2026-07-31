import { Inject, Injectable } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { Device } from "../../../devices/domain/entities/device.entity";
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../../devices/domain/repositories/device.repository";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";

export type RegisterVehicleGpsDeviceCommand = {
  vehicleId: string;
  tenantId: string;
  imei: string;
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  installedAt?: string;
};

@Injectable()
export class RegisterVehicleGpsDeviceUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
  ) {}

  async execute(command: RegisterVehicleGpsDeviceCommand) {
    const vehicle = await this.vehicleRepository.findById(command.vehicleId, command.tenantId);
    if (!vehicle) {
      throw new VehicleNotFoundError(command.vehicleId);
    }

    const existingByVehicle = await this.deviceRepository.findByVehicleId(vehicle.id, command.tenantId);
    if (existingByVehicle && existingByVehicle.imei !== command.imei) {
      await this.deviceRepository.save(existingByVehicle.unassignFromVehicle());
    }

    const existingDevice = await this.deviceRepository.findByImei(command.imei, vehicle.tenantId);
    if (existingDevice?.vehicleId && existingDevice.vehicleId !== vehicle.id) {
      const previousVehicle = await this.vehicleRepository.findById(existingDevice.vehicleId, vehicle.tenantId);
      if (previousVehicle && previousVehicle.gpsDevice?.imei === existingDevice.imei) {
        await this.vehicleRepository.save(previousVehicle.clearGpsDevice());
      }
    }

    const syncedDevice = existingDevice
      ? existingDevice
          .update({
            manufacturer: command.manufacturer,
            model: command.model,
            firmwareVersion: command.firmwareVersion,
          })
          // Legacy clients still map devices directly to vehicles, so this path must keep working
          // even if the standalone device lifecycle flow was not used beforehand.
          .forceAssignToVehicle(vehicle.id)
      : Device.create({
          id: this.runtime.generateId(),
          imei: command.imei,
          manufacturer: command.manufacturer,
          model: command.model,
          firmwareVersion: command.firmwareVersion,
          tenantId: vehicle.tenantId,
          lifecycleStatus: "assigned",
          vehicleId: vehicle.id,
          signalStrength: null,
          batteryLevel: null,
          lastSeen: null,
          assignedAt: command.installedAt ?? new Date().toISOString(),
        });

    const updatedVehicle = vehicle.registerGpsDevice({
      imei: command.imei,
      manufacturer: command.manufacturer,
      model: command.model,
      firmwareVersion: command.firmwareVersion,
      installedAt: command.installedAt ?? syncedDevice.assignedAt ?? new Date().toISOString(),
    });

    await this.deviceRepository.save(syncedDevice);
    await this.vehicleRepository.save(updatedVehicle);
    return updatedVehicle.toPrimitives();
  }
}
