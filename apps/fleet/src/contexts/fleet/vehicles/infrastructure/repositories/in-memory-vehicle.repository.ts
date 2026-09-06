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
    const ownerOperatorId = filters?.ownerOperatorId;
    const query = filters?.query?.trim().toLowerCase();

    return Array.from(this.data.values()).filter((vehicle) => {
      if (filters?.tenantId && vehicle.tenantId !== filters.tenantId) {
        return false;
      }
      if (ownerOperatorId && vehicle.ownerOperatorId !== ownerOperatorId) {
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
        vehicle.vin ?? "",
        vehicle.make ?? "",
        vehicle.model,
        vehicle.type ?? "",
        vehicle.gpsDevice?.imei ?? "",
        vehicle.gpsDevice?.manufacturer ?? "",
        vehicle.gpsDevice?.model ?? "",
        vehicle.gpsDevice?.firmwareVersion ?? "",
      ].some((value) => value.toLowerCase().includes(query));
    });
  }

  async findById(id: string, tenantId: string): Promise<Vehicle | null> {
    const vehicle = this.data.get(id);
    if (!vehicle || vehicle.tenantId !== tenantId) return null;
    return vehicle;
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

  async findByAssignedDriverId(driverId: string, tenantId: string): Promise<Vehicle | null> {
    return (
      Array.from(this.data.values()).find(
        (vehicle) => vehicle.assignedDriverId === driverId && vehicle.tenantId === tenantId,
      ) ?? null
    );
  }

  async findAllByOwnerOperatorId(ownerOperatorId: string, tenantId: string): Promise<Vehicle[]> {
    return Array.from(this.data.values()).filter(
      (vehicle) => vehicle.ownerOperatorId === ownerOperatorId && vehicle.tenantId === tenantId,
    );
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const vehicle = this.data.get(id);
    if (!vehicle || vehicle.tenantId !== tenantId) return;
    this.data.delete(id);
  }
}
