import { Inject, Injectable } from "@nestjs/common";
import {
  VEHICLE_REPOSITORY,
  type VehicleFilters,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../../drivers/domain/repositories/driver.repository";

@Injectable()
export class ListVehiclesUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute(filters?: VehicleFilters) {
    const vehicles = await this.vehicleRepository.findAll(filters);
    const primitives = vehicles.map((v) => v.toPrimitives());

    // Scope each driver lookup by its owning vehicle's own tenantId (not
    // filters.tenantId, which may be unset for an admin cross-tenant list) —
    // this keeps the lookup correctly scoped in every case.
    const driverLookups = new Map<string, string>();
    for (const vehicle of primitives) {
      if (vehicle.assignedDriverId) {
        driverLookups.set(vehicle.assignedDriverId, vehicle.tenantId);
      }
    }
    const driverMap = new Map<string, string>();
    if (driverLookups.size > 0) {
      await Promise.all(
        [...driverLookups.entries()].map(async ([id, tenantId]) => {
          const driver = await this.driverRepository.findById(id, tenantId);
          if (driver) driverMap.set(id, driver.name);
        }),
      );
    }

    return primitives.map((v) => ({
      ...v,
      assignedDriverName: v.assignedDriverId ? (driverMap.get(v.assignedDriverId) ?? null) : null,
      fuelLevelPercent: null as number | null,
    }));
  }
}
