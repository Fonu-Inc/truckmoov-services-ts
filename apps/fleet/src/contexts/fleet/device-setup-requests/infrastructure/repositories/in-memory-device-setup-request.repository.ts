import { Injectable } from "@nestjs/common";
import type { DeviceSetupRequest } from "../../domain/entities/device-setup-request.entity";
import type {
  DeviceSetupRequestFilters,
  DeviceSetupRequestRepository,
} from "../../domain/repositories/device-setup-request.repository";

@Injectable()
export class InMemoryDeviceSetupRequestRepository implements DeviceSetupRequestRepository {
  private readonly data = new Map<string, DeviceSetupRequest>();

  async save(request: DeviceSetupRequest): Promise<void> {
    this.data.set(request.id, request);
  }

  async findAll(filters?: DeviceSetupRequestFilters): Promise<DeviceSetupRequest[]> {
    const query = filters?.query?.trim().toLowerCase();

    return Array.from(this.data.values())
      .filter((request) => {
        if (filters?.tenantId && request.tenantId !== filters.tenantId) return false;
        if (filters?.status && request.status !== filters.status) return false;
        if (!query) return true;
        const p = request.toPrimitives();
        return [p.manufacturer, p.model ?? "", p.useCase, p.status, p.vehicleId ?? ""].some(
          (value) => value.toLowerCase().includes(query),
        );
      })
      .sort((a, b) => b.toPrimitives().createdAt.localeCompare(a.toPrimitives().createdAt));
  }

  async findById(id: string): Promise<DeviceSetupRequest | null> {
    return this.data.get(id) ?? null;
  }

  async deleteById(id: string): Promise<void> {
    this.data.delete(id);
  }
}
