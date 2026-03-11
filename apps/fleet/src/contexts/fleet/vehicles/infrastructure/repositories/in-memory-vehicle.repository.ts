import { Injectable } from "@nestjs/common";
import type { Vehicle } from "../../domain/entities/vehicle.entity";
import type {
  VehicleFilters,
  VehicleRepository,
} from "../../domain/repositories/vehicle.repository";

@Injectable()
export class InMemoryVehicleRepository implements VehicleRepository {
  private readonly data = new Map<string, Vehicle>();

  async save(vehicle: Vehicle): Promise<void> {
    this.data.set(vehicle.id, vehicle);
  }

  async findAll(filters?: VehicleFilters): Promise<Vehicle[]> {
    const query = filters?.query?.trim().toLowerCase();

    return Array.from(this.data.values()).filter((vehicle) => {
      if (filters?.tenantId && vehicle.tenantId !== filters.tenantId) {
        return false;
      }
      if (filters?.status && vehicle.status !== filters.status) {
        return false;
      }
      if (
        filters?.assigned !== undefined
        && (filters.assigned ? !vehicle.assignedDriverId : Boolean(vehicle.assignedDriverId))
      ) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [
        vehicle.id,
        vehicle.plateNumber,
        vehicle.model,
        vehicle.gpsDevice?.deviceId ?? "",
        vehicle.gpsDevice?.serialNumber ?? "",
      ].some((value) => value.toLowerCase().includes(query));
    });
  }

  async findById(id: string): Promise<Vehicle | null> {
    return this.data.get(id) ?? null;
  }

  async findByPlateNumber(plateNumber: string, tenantId: string): Promise<Vehicle | null> {
    const normalizedPlate = plateNumber.trim().toUpperCase();
    return (
      Array.from(this.data.values()).find(
        (vehicle) =>
          vehicle.plateNumber === normalizedPlate
          && vehicle.tenantId === tenantId.trim(),
      ) ?? null
    );
  }

  async findByAssignedDriverId(driverId: string): Promise<Vehicle | null> {
    return (
      Array.from(this.data.values()).find(
        (vehicle) => vehicle.assignedDriverId === driverId,
      ) ?? null
    );
  }

  async deleteById(id: string): Promise<void> {
    this.data.delete(id);
  }
}
