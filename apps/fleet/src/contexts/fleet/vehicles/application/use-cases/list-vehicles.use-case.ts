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

    const driverIds = [...new Set(primitives.map((v) => v.assignedDriverId).filter(Boolean))] as string[];
    const driverMap = new Map<string, string>();
    if (driverIds.length > 0) {
      await Promise.all(
        driverIds.map(async (id) => {
          const driver = await this.driverRepository.findById(id);
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
