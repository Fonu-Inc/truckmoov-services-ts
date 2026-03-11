import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppConfigService } from "@shared/config";
import type { FleetAssetStatus } from "../../../shared/domain/fleet-status";
import { Vehicle } from "../../domain/entities/vehicle.entity";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";

export type BulkImportVehicleItem = {
  plateNumber: string;
  model: string;
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
    private readonly config: AppConfigService,
  ) {}

  async execute(command: BulkImportVehiclesCommand) {
    let created = 0;
    let updated = 0;
    const records: ReturnType<Vehicle["toPrimitives"]>[] = [];

    for (const item of command.items) {
      const tenantId = (item.tenantId ?? command.tenantId ?? this.config.fleet.defaultTenant).trim();
      const existingVehicle = await this.vehicleRepository.findByPlateNumber(item.plateNumber, tenantId);

      if (existingVehicle) {
        const updatedVehicle = existingVehicle.update({
          plateNumber: item.plateNumber,
          model: item.model,
          tenantId,
          status: item.status ?? existingVehicle.status,
        });
        await this.vehicleRepository.save(updatedVehicle);
        records.push(updatedVehicle.toPrimitives());
        updated += 1;
        continue;
      }

      const createdVehicle = Vehicle.create({
        id: randomUUID(),
        plateNumber: item.plateNumber,
        model: item.model,
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
