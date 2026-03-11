import { Inject, Injectable } from "@nestjs/common";
import {
  VEHICLE_REPOSITORY,
  type VehicleFilters,
  type VehicleRepository,
} from "../../domain/repositories/vehicle.repository";

@Injectable()
export class ListVehiclesUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
  ) {}

  async execute(filters?: VehicleFilters) {
    const vehicles = await this.vehicleRepository.findAll(filters);
    return vehicles.map((vehicle) => vehicle.toPrimitives());
  }
}
