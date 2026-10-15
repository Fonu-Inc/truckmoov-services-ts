import { Inject, Injectable } from "@nestjs/common";
import type { FleetAssetStatus } from "@fleet/shared/domain/fleet-status";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { QuotaService } from "../../../../../quota.service";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import { Vehicle, type FleetVehicleType, type FleetFuelType } from "../../domain/entities/vehicle.entity";
import type { VehicleCapacityUnit } from "../../domain/vehicle-capacity";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";
import { assertRoomForActiveVehicles } from "./create-vehicle.use-case";

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
  capacityUnit?: VehicleCapacityUnit;
  tenantId?: string;
  status?: FleetAssetStatus;
};

export type BulkImportVehiclesCommand = {
  tenantId?: string;
  /** Set when an owner operator imports, so the vehicles created are theirs. */
  ownerOperatorId?: string;
  items: BulkImportVehicleItem[];
};

@Injectable()
export class BulkImportVehiclesUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
    @Inject(QuotaService)
    private readonly quotaService: QuotaService,
  ) {}

  async execute(command: BulkImportVehiclesCommand) {
    let created = 0;
    let updated = 0;
    const records: ReturnType<Vehicle["toPrimitives"]>[] = [];
    const tenantId = (command.tenantId ?? this.runtime.getDefaultTenantId()).trim();
    const rows = await this.matchExisting(command.items, tenantId);

    // Whole file refused, as with devices: a partial import leaves a spreadsheet to reconcile.
    const activations = rows.filter(
      ({ item, existingVehicle }) =>
        (item.status ?? existingVehicle?.status ?? "active") === "active" && existingVehicle?.status !== "active",
    ).length;
    await assertRoomForActiveVehicles(this.vehicleRepository, this.quotaService, tenantId, activations);

    for (const { item, plateNumber, existingVehicle } of rows) {
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
          capacityUnit: item.capacityUnit,
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
        capacityUnit: item.capacityUnit ?? null,
        tenantId,
        status: item.status ?? "active",
        assignedDriverId: null,
        ownerOperatorId: command.ownerOperatorId ?? null,
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

  private async matchExisting(items: BulkImportVehicleItem[], tenantId: string) {
    const seen = new Set<string>();
    const rows = [];
    for (const item of items) {
      const plateNumber = item.registrationNumber ?? item.plateNumber ?? "";
      const key = plateNumber.trim().toUpperCase();
      if (key && seen.has(key)) {
        throw new FleetRuleError(`plate ${key} appears more than once in the file`);
      }
      seen.add(key);
      const existingVehicle = await this.vehicleRepository.findByPlateNumber(plateNumber, tenantId);
      rows.push({ item, plateNumber, existingVehicle });
    }
    return rows;
  }
}
