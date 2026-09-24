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
      if (
        filters?.lifecycleStatusIn
        && !filters.lifecycleStatusIn.includes(device.lifecycleStatus)
      ) {
        return false;
      }
      if (
        filters?.verificationStatus
        && device.verificationStatus !== filters.verificationStatus
      ) {
        return false;
      }
      if (filters?.verifiedAfter) {
        if (!device.verifiedAt) return false;
        if (Date.parse(device.verifiedAt) < filters.verifiedAfter.getTime()) return false;
      }
      if (filters?.lastSeenIsNull && device.lastSeen) {
        return false;
      }
      if (filters?.lastSeenAfter) {
        if (!device.lastSeen) return false;
        if (Date.parse(device.lastSeen) < filters.lastSeenAfter.getTime()) return false;
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

  async findByIds(tenantId: string, ids: string[]): Promise<Device[]> {
    return [...new Set(ids)].flatMap((id) => {
      const device = this.data.get(id);
      return device && device.tenantId === tenantId ? [device] : [];
    });
  }

  async findById(id: string, tenantId: string): Promise<Device | null> {
    const device = this.data.get(id);
    if (!device || device.tenantId !== tenantId) return null;
    return device;
  }

  async findByIdAcrossTenants(id: string): Promise<Device | null> {
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

  async findByVehicleId(vehicleId: string, tenantId: string): Promise<Device | null> {
    return (
      Array.from(this.data.values()).find(
        (device) => device.vehicleId === vehicleId && device.tenantId === tenantId,
      ) ?? null
    );
  }

  async findAwaitingVerificationPastDeadline(now: Date, limit: number): Promise<Device[]> {
    return Array.from(this.data.values())
      .filter((device) => device.hasVerificationExpired(now.toISOString()))
      .sort(
        (left, right) =>
          Date.parse(left.verificationDeadline ?? "")
          - Date.parse(right.verificationDeadline ?? ""),
      )
      .slice(0, limit);
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const device = this.data.get(id);
    if (!device || device.tenantId !== tenantId) return;
    this.data.delete(id);
  }
}
