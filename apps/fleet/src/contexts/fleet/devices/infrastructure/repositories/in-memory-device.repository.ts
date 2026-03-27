import { Injectable } from "@nestjs/common";
import type { Device } from "../../domain/entities/device.entity";
import type { DeviceFilters, DeviceRepository } from "../../domain/repositories/device.repository";

@Injectable()
export class InMemoryDeviceRepository implements DeviceRepository {
  private readonly data = new Map<string, Device>();

  async save(device: Device): Promise<void> {
    this.data.set(device.id, device);
  }

  async findAll(filters?: DeviceFilters): Promise<Device[]> {
    const query = filters?.query?.trim().toLowerCase();

    return Array.from(this.data.values()).filter((device) => {
      if (filters?.tenantId && device.tenantId !== filters.tenantId) {
        return false;
      }
      if (filters?.manufacturer && device.manufacturer !== filters.manufacturer) {
        return false;
      }
      if (filters?.status && device.status !== filters.status) {
        return false;
      }
      if (filters?.lifecycleStatus && device.lifecycleStatus !== filters.lifecycleStatus) {
        return false;
      }
      if (filters?.vehicleId && device.vehicleId !== filters.vehicleId) {
        return false;
      }
      if (
        filters?.assigned !== undefined
        && (filters.assigned ? !device.vehicleId : Boolean(device.vehicleId))
      ) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [
        device.id,
        device.imei,
        device.manufacturer,
        device.model,
        device.firmwareVersion,
        device.status,
        device.lifecycleStatus,
        device.vehicleId ?? "",
      ].some((value) => value.toLowerCase().includes(query));
    });
  }

  async findById(id: string): Promise<Device | null> {
    return this.data.get(id) ?? null;
  }

  async findByImei(imei: string, tenantId: string): Promise<Device | null> {
    const normalizedImei = imei.trim();
    return (
      Array.from(this.data.values()).find(
        (device) => device.imei === normalizedImei && device.tenantId === tenantId.trim(),
      ) ?? null
    );
  }

  async findByVehicleId(vehicleId: string): Promise<Device | null> {
    return (
      Array.from(this.data.values()).find((device) => device.vehicleId === vehicleId) ?? null
    );
  }

  async deleteById(id: string): Promise<void> {
    this.data.delete(id);
  }
}
