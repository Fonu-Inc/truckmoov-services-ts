import { Inject, Injectable } from "@nestjs/common";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import type { FleetAssetStatus } from "@fleet/shared/domain/fleet-status";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../domain/repositories/vehicle.repository";
import { FleetQuotaExceededError, QuotaService } from "../../../../../quota.service";
import { Vehicle, type FleetVehicleType, type FleetFuelType } from "../../domain/entities/vehicle.entity";
import type { VehicleCapacityUnit } from "../../domain/vehicle-capacity";

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
  capacityUnit?: VehicleCapacityUnit;
  tenantId?: string;
  status?: FleetAssetStatus;
  /** Set when an owner operator adds the vehicle, so it appears in their own list. */
  ownerOperatorId?: string;
};

@Injectable()
export class CreateVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
    @Inject(QuotaService)
    private readonly quotaService: QuotaService,
  ) {}

  async execute(command: CreateVehicleCommand) {
    const tenantId = command.tenantId ?? this.runtime.getDefaultTenantId();
    const status = command.status ?? "active";

    // The UI posts registrationNumber, but older integrations still use plateNumber.
    const plateNumber = command.registrationNumber ?? command.plateNumber;
    if (plateNumber?.trim() && (await this.vehicleRepository.findByPlateNumber(plateNumber, tenantId))) {
      throw new FleetRuleError(`vehicle with plate ${plateNumber.trim().toUpperCase()} already exists`);
    }

    // Only an active vehicle consumes the plan allowance, so creating an
    // inactive record stays permitted at the ceiling.
    if (status === "active") {
      await assertRoomForActiveVehicles(this.vehicleRepository, this.quotaService, tenantId, 1);
    }

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
      capacityUnit: command.capacityUnit ?? null,
      tenantId,
      status,
      assignedDriverId: null,
      ownerOperatorId: command.ownerOperatorId ?? null,
      gpsDevice: null,
    });

    await this.vehicleRepository.save(vehicle);
    return vehicle.toPrimitives();
  }
}

/**
 * Counts active vehicles, not every vehicle ever created: a decommissioned
 * vehicle does not occupy a seat on the plan.
 */
export async function assertRoomForActiveVehicles(
  vehicleRepository: VehicleRepository,
  quotaService: QuotaService,
  tenantId: string,
  additional: number,
): Promise<void> {
  if (additional <= 0) return;
  const active = await vehicleRepository.findAll({ tenantId, status: "active" });

  try {
    await quotaService.assertRoomFor(tenantId, "vehicles", active.length, additional);
  } catch (error) {
    if (error instanceof FleetQuotaExceededError) {
      throw new VehicleQuotaExceededError(error.limit, error.current);
    }
    throw error;
  }
}
