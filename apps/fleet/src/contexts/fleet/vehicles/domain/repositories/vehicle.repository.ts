import type { Vehicle } from "../entities/vehicle.entity";

export interface VehicleRepository {
  save(vehicle: Vehicle): Promise<void>;
  findAll(): Promise<Vehicle[]>;
  findById(id: string): Promise<Vehicle | null>;
  deleteById(id: string): Promise<void>;
}

export const VEHICLE_REPOSITORY = Symbol("VEHICLE_REPOSITORY");
