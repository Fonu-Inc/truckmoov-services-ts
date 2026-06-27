import { Inject, Injectable } from "@nestjs/common";
import type { FleetAssetStatus } from "@fleet/shared/domain/fleet-status";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { Vehicle, type FleetVehicleType, type FleetFuelType } from "../../domain/entities/vehicle.entity";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";

export type BulkImportVehicleItem = {
  plateNumber?: string;
  registrationNumber?: string;
  vin?: string;
  make?: string;
  model: string;
  year?: number;
  type?: FleetVehicleType;
  fuelType?: FleetFuelType;
  capacity?: number;
  tenantId?: string;
  status?: FleetAssetStatus;
};

export type BulkImportVehiclesCommand = {
  tenantId?: string;
  items: BulkImportVehicleItem[];
};

@Injectable()
export class BulkImportVehiclesUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
  ) {}

  async execute(command: BulkImportVehiclesCommand) {
    let created = 0;
    let updated = 0;
    const records: ReturnType<Vehicle["toPrimitives"]>[] = [];

    for (const item of command.items) {
      const tenantId = (command.tenantId ?? this.runtime.getDefaultTenantId()).trim();
      const plateNumber = item.registrationNumber ?? item.plateNumber ?? "";
      const existingVehicle = await this.vehicleRepository.findByPlateNumber(plateNumber, tenantId);

      if (existingVehicle) {
        const updatedVehicle = existingVehicle.update({
          plateNumber,
          vin: item.vin,
          make: item.make,
          model: item.model,
          year: item.year,
          type: item.type,
          fuelType: item.fuelType,
          capacity: item.capacity,
          tenantId,
          status: item.status ?? existingVehicle.status,
        });
        await this.vehicleRepository.save(updatedVehicle);
        records.push(updatedVehicle.toPrimitives());
        updated += 1;
        continue;
      }

      const createdVehicle = Vehicle.create({
        id: this.runtime.generateId(),
        plateNumber,
        vin: item.vin ?? null,
        make: item.make ?? null,
        model: item.model,
        year: item.year ?? null,
        type: item.type ?? null,
        fuelType: item.fuelType ?? null,
        capacity: item.capacity ?? null,
        tenantId,
        status: item.status ?? "active",
        assignedDriverId: null,
        gpsDevice: null,
      });
      await this.vehicleRepository.save(createdVehicle);
      records.push(createdVehicle.toPrimitives());
      created += 1;
    }

    return {
      created,
      updated,
      total: records.length,
      records,
    };
  }
}
