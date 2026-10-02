import { Inject, Injectable } from "@nestjs/common";
import type { FleetAssetStatus } from "../../../shared/domain/fleet-status";
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../../devices/domain/repositories/device.repository";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";

export type ListGpsDevicesFilters = {
  query?: string;
  tenantId: string;
  vehicleStatus?: FleetAssetStatus;
};

@Injectable()
export class ListGpsDevicesUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
  ) {}

  async execute(filters: ListGpsDevicesFilters) {
    const devices = await this.deviceRepository.findAll({
      query: filters.query,
      tenantId: filters.tenantId,
    });
    const vehicles = await this.vehicleRepository.findAll({
      tenantId: filters.tenantId,
      status: filters.vehicleStatus,
    });
    const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

    // Keep the historical /gps-devices endpoint alive as an alias, but source it from the new
    // standalone device registry so the admin Devices page and legacy fleet consumers stay aligned.
    return devices
      .filter((device) => {
        if (!filters.vehicleStatus) {
          return true;
        }
        const vehicle = device.vehicleId ? vehiclesById.get(device.vehicleId) : undefined;
        return vehicle?.status === filters.vehicleStatus;
      })
      .map((device) => {
        const vehicle = device.vehicleId ? vehiclesById.get(device.vehicleId) : undefined;
        return {
          ...device.toPrimitives(),
          id: device.imei,
          installedAt: device.assignedAt ?? device.createdAt,
          vehicleId: vehicle?.id ?? null,
          vehicleRegistrationNumber: vehicle?.registrationNumber ?? null,
          vehicleStatus: vehicle?.status ?? null,
        };
      });
  }
}
