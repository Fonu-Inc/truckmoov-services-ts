import { Inject, Injectable } from "@nestjs/common";
import type { FleetAssetStatus } from "@fleet/shared/domain/fleet-status";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../domain/repositories/vehicle.repository";
import { Vehicle, type FleetVehicleType } from "../../domain/entities/vehicle.entity";

export type CreateVehicleCommand = {
  plateNumber?: string;
  registrationNumber?: string;
  vin?: string;
  make?: string;
  model: string;
  year?: number;
  type?: FleetVehicleType;
  capacity?: number;
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
    // The UI posts registrationNumber, but older integrations still use plateNumber.
    const plateNumber = command.registrationNumber ?? command.plateNumber;
    const vehicle = Vehicle.create({
      id: this.runtime.generateId(),
      plateNumber: plateNumber ?? "",
      vin: command.vin ?? null,
      make: command.make ?? null,
      model: command.model,
      year: command.year ?? null,
      type: command.type ?? null,
      capacity: command.capacity ?? null,
      tenantId: command.tenantId ?? this.runtime.getDefaultTenantId(),
      status: command.status ?? "active",
      assignedDriverId: null,
      gpsDevice: null,
    });

    await this.vehicleRepository.save(vehicle);
    return vehicle.toPrimitives();
  }
}
