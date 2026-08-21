import { Inject, Injectable } from "@nestjs/common";
import type { FleetAssetStatus } from "@fleet/shared/domain/fleet-status";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../domain/repositories/vehicle.repository";
import { VEHICLE_QUOTA_READER, type VehicleQuotaReader } from "../../domain/ports/vehicle-quota-reader.port";
import { Vehicle, type FleetVehicleType, type FleetFuelType } from "../../domain/entities/vehicle.entity";

export class VehicleQuotaExceededError extends Error {
  constructor(
    readonly limit: number,
    readonly current: number,
  ) {
    super(`Plan allows ${limit} active vehicles and ${current} are already active`);
  }
}

export type CreateVehicleCommand = {
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

@Injectable()
export class CreateVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
    @Inject(VEHICLE_QUOTA_READER)
    private readonly quotaReader: VehicleQuotaReader,
  ) {}

  async execute(command: CreateVehicleCommand) {
    const tenantId = command.tenantId ?? this.runtime.getDefaultTenantId();
    const status = command.status ?? "active";

    // Only an active vehicle consumes the plan allowance, so creating an
    // inactive record stays permitted at the ceiling.
    if (status === "active") {
      await this.assertQuotaAllowsAnotherActiveVehicle(tenantId);
    }

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
      fuelType: command.fuelType ?? null,
      capacity: command.capacity ?? null,
      tenantId,
      status,
      assignedDriverId: null,
      gpsDevice: null,
    });

    await this.vehicleRepository.save(vehicle);
    return vehicle.toPrimitives();
  }

  private async assertQuotaAllowsAnotherActiveVehicle(tenantId: string): Promise<void> {
    const limit = await this.quotaReader.findActiveVehicleLimit(tenantId);
    if (limit === null) return;

    const active = await this.vehicleRepository.findAll({ tenantId, status: "active" });
    if (active.length >= limit) {
      throw new VehicleQuotaExceededError(limit, active.length);
    }
  }
}
