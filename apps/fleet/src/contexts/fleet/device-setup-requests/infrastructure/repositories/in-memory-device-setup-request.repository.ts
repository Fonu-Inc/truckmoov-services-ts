import { Injectable } from "@nestjs/common";
import {
  setupRequestSearchFields,
  type DeviceSetupRequest,
} from "../../domain/entities/device-setup-request.entity";
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

  async findAll(filters: DeviceSetupRequestFilters): Promise<DeviceSetupRequest[]> {
    const query = filters?.query?.trim().toLowerCase();

    return Array.from(this.data.values())
      .filter((request) => {
        if (request.tenantId !== filters.tenantId) return false;
        if (filters?.status && request.status !== filters.status) return false;
        if (!query) return true;
        const p = request.toPrimitives();
        return setupRequestSearchFields(p).some((value) => value.toLowerCase().includes(query));
      })
      .sort((a, b) => b.toPrimitives().createdAt.localeCompare(a.toPrimitives().createdAt));
  }

  async findById(id: string, tenantId: string): Promise<DeviceSetupRequest | null> {
    const request = this.data.get(id);
    if (!request || request.tenantId !== tenantId) return null;
    return request;
  }

  async referenceExists(referenceNumber: string): Promise<boolean> {
    return Array.from(this.data.values()).some((request) => request.referenceNumber === referenceNumber);
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const request = this.data.get(id);
    if (!request || request.tenantId !== tenantId) return;
    this.data.delete(id);
  }
}
