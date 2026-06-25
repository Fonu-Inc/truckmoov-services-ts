import { Inject, Injectable } from "@nestjs/common";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import { VehicleNotFoundError } from "../../../vehicles/domain/errors/vehicle-not-found.error";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../../vehicles/domain/repositories/vehicle.repository";
import { buildVehicleGpsSnapshot } from "./device-vehicle-sync";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import {
  DEVICE_IDENTITY_EVENT_PUBLISHER,
  type DeviceIdentityEventPublisher,
} from "../../domain/ports/device-identity-event.publisher";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";
import { emitDeviceIdentity } from "./device-identity-emit";

export type AssignDeviceToVehicleCommand = {
  deviceId: string;
  vehicleId: string;
};

@Injectable()
export class AssignDeviceToVehicleUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(DEVICE_IDENTITY_EVENT_PUBLISHER)
    private readonly identityPublisher: DeviceIdentityEventPublisher,
  ) {}

  async execute(command: AssignDeviceToVehicleCommand) {
    const device = await this.deviceRepository.findById(command.deviceId);
    if (!device) {
      throw new DeviceNotFoundError(command.deviceId);
    }

    const vehicle = await this.vehicleRepository.findById(command.vehicleId);
    if (!vehicle) {
      throw new VehicleNotFoundError(command.vehicleId);
    }

    if (device.tenantId !== vehicle.tenantId) {
      throw new FleetRuleError("device and vehicle must belong to the same tenant");
    }
    if (vehicle.status !== "active") {
      throw new FleetRuleError("only active vehicles can receive a GPS device");
    }
    if (device.vehicleId && device.vehicleId !== vehicle.id) {
      throw new FleetRuleError("device is already assigned to another vehicle");
    }
    if (!["verified_online", "assignable", "assigned"].includes(device.lifecycleStatus)) {
      throw new FleetRuleError("device must be verified online before assignment");
    }

    const occupyingDevice = await this.deviceRepository.findByVehicleId(vehicle.id);
    if (occupyingDevice && occupyingDevice.id !== device.id) {
      throw new FleetRuleError("vehicle already has a GPS device assigned");
    }

    const updatedDevice = device.assignToVehicle(vehicle.id);
    const updatedVehicle = vehicle.registerGpsDevice(
      buildVehicleGpsSnapshot(updatedDevice, vehicle.gpsDevice?.installedAt),
    );

    await this.deviceRepository.save(updatedDevice);
    await this.vehicleRepository.save(updatedVehicle);
    await emitDeviceIdentity(this.identityPublisher, updatedDevice, "assigned");
    return updatedDevice.toPrimitives();
  }
}
