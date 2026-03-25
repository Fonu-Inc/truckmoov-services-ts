import { Inject, Injectable } from "@nestjs/common";
import type { FleetAssetStatus } from "../../../shared/domain/fleet-status";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";

export type ListGpsDevicesFilters = {
  query?: string;
  tenantId?: string;
  vehicleStatus?: FleetAssetStatus;
};

@Injectable()
export class ListGpsDevicesUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
  ) {}

  async execute(filters?: ListGpsDevicesFilters) {
    const vehicles = await this.vehicleRepository.findAll({
      query: filters?.query,
      tenantId: filters?.tenantId,
      status: filters?.vehicleStatus,
    });

    // GPS devices are currently modeled as vehicle-attached tracking assets in Fleet.
    return vehicles
      .filter((vehicle) => vehicle.gpsDevice !== null)
      .map((vehicle) => ({
        id: vehicle.gpsDevice!.imei,
        imei: vehicle.gpsDevice!.imei,
        manufacturer: vehicle.gpsDevice!.manufacturer,
        model: vehicle.gpsDevice!.model,
        firmwareVersion: vehicle.gpsDevice!.firmwareVersion,
        installedAt: vehicle.gpsDevice!.installedAt,
        tenantId: vehicle.tenantId,
        vehicleId: vehicle.id,
        vehicleRegistrationNumber: vehicle.registrationNumber,
        vehicleStatus: vehicle.status,
      }));
  }
}
