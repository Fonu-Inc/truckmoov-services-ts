import { Injectable } from "@nestjs/common";
import type { Vehicle } from "../../domain/entities/vehicle.entity";
import type { VehicleRepository } from "../../domain/repositories/vehicle.repository";

@Injectable()
export class InMemoryVehicleRepository implements VehicleRepository {
  private readonly data = new Map<string, Vehicle>();

  async save(vehicle: Vehicle): Promise<void> {
    this.data.set(vehicle.id, vehicle);
  }

  async findAll(): Promise<Vehicle[]> {
    return Array.from(this.data.values());
  }

  async findById(id: string): Promise<Vehicle | null> {
    return this.data.get(id) ?? null;
  }

  async deleteById(id: string): Promise<void> {
    this.data.delete(id);
  }
}
