import { Inject, Injectable } from "@nestjs/common";
import { QuotaService } from "../../../../../quota.service";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";
import type { FleetAssetStatus } from "../../../shared/domain/fleet-status";
import type { FleetVehicleType, FleetFuelType } from "../../domain/entities/vehicle.entity";
import type { VehicleCapacityUnit } from "../../domain/vehicle-capacity";
import { assertRoomForActiveVehicles } from "./create-vehicle.use-case";

export type UpdateVehicleCommand = {
  id: string;
  tenantId: string;
  registrationNumber?: string;
  plateNumber?: string;
  vin?: string | null;
  make?: string | null;
  model?: string;
  year?: number | null;
  type?: FleetVehicleType | null;
  fuelType?: FleetFuelType | null;
  capacity?: number | null;
  capacityUnit?: VehicleCapacityUnit | null;
  status?: FleetAssetStatus;
};

@Injectable()
export class UpdateVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(QuotaService)
    private readonly quotaService: QuotaService,
  ) {}

  async execute(command: UpdateVehicleCommand) {
    const existingVehicle = await this.vehicleRepository.findById(command.id, command.tenantId);
    if (!existingVehicle) {
      throw new VehicleNotFoundError(command.id);
    }
    const plateNumber = command.registrationNumber ?? command.plateNumber;
    await this.assertPlateFree(plateNumber, command.tenantId, existingVehicle.id);
    if (command.status === "active" && existingVehicle.status !== "active") {
      await assertRoomForActiveVehicles(this.vehicleRepository, this.quotaService, command.tenantId, 1);
    }

    // Keep the same aliasing rule on updates so the UI never has to know about plateNumber.
    // tenantId is never taken from the command here — it's only used above to
    // scope the lookup. Passing it through would let a caller reassign this
    // vehicle into their own tenant.
    const updatedVehicle = existingVehicle.update({
      plateNumber,
      vin: command.vin,
      make: command.make,
      model: command.model,
      year: command.year,
      type: command.type,
      fuelType: command.fuelType,
      capacity: command.capacity,
      capacityUnit: command.capacityUnit,
      status: command.status,
    });

    await this.vehicleRepository.save(updatedVehicle);
    return updatedVehicle.toPrimitives();
  }

  private async assertPlateFree(plateNumber: string | undefined, tenantId: string, vehicleId: string) {
    if (!plateNumber?.trim()) return;
    const holder = await this.vehicleRepository.findByPlateNumber(plateNumber, tenantId);
    if (holder && holder.id !== vehicleId) {
      throw new FleetRuleError(`vehicle with plate ${holder.plateNumber} already exists`);
    }
  }
}
