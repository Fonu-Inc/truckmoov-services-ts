import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../../vehicles/domain/repositories/vehicle.repository";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";

type AssignmentValidation = {
  canAssign: boolean;
  reason?: string;
};

@Injectable()
export class ValidateDeviceAssignmentUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
  ) {}

  async execute(deviceId: string, vehicleId: string): Promise<AssignmentValidation> {
    const device = await this.deviceRepository.findById(deviceId);
    if (!device) {
      return { canAssign: false, reason: "Device not found" };
    }

    const vehicle = await this.vehicleRepository.findById(vehicleId);
    if (!vehicle) {
      return { canAssign: false, reason: "Vehicle not found" };
    }

    if (device.tenantId !== vehicle.tenantId) {
      return { canAssign: false, reason: "Device and vehicle must belong to the same tenant" };
    }
    if (vehicle.status !== "active") {
      return { canAssign: false, reason: "Only active vehicles can receive a device" };
    }
    if (!["verified_online", "assignable", "assigned"].includes(device.lifecycleStatus)) {
      return { canAssign: false, reason: "Device must be verified online before assignment" };
    }
    if (device.vehicleId && device.vehicleId !== vehicle.id) {
      return { canAssign: false, reason: "Device is already assigned to another vehicle" };
    }

    const occupyingDevice = await this.deviceRepository.findByVehicleId(vehicle.id);
    if (occupyingDevice && occupyingDevice.id !== device.id) {
      return { canAssign: false, reason: "Vehicle already has a GPS device assigned" };
    }

    return { canAssign: true };
  }
}
