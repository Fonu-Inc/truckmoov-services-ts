import { Inject, Injectable } from "@nestjs/common";
import type { FleetAssetStatus } from "@fleet/shared/domain/fleet-status";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../domain/repositories/vehicle.repository";
import { Vehicle } from "../../domain/entities/vehicle.entity";

export type CreateVehicleCommand = {
  plateNumber: string;
  model: string;
  tenantId?: string;
  status?: FleetAssetStatus;
};

@Injectable()
export class CreateVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
  ) {}

  async execute(command: CreateVehicleCommand) {
    const vehicle = Vehicle.create({
      id: this.runtime.generateId(),
      plateNumber: command.plateNumber,
      model: command.model,
      tenantId: command.tenantId ?? this.runtime.getDefaultTenantId(),
      status: command.status ?? "active",
      assignedDriverId: null,
      gpsDevice: null,
    });

    await this.vehicleRepository.save(vehicle);
    return vehicle.toPrimitives();
  }
}
