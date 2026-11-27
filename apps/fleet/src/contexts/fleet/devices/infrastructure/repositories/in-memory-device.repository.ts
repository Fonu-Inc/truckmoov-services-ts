import { Injectable } from "@nestjs/common";
import { scopeKey } from "../../domain/ports/installer-device-scope.port";
import type { Device } from "../../domain/entities/device.entity";
import type { DeviceFilters, DeviceRepository } from "../../domain/repositories/device.repository";

@Injectable()
export class InMemoryDeviceRepository implements DeviceRepository {
  private readonly data = new Map<string, Device>();

  async save(device: Device): Promise<void> {
    this.data.set(device.id, device);
  }

  async claimStockDevice(before: Device, moved: Device): Promise<boolean> {
    const stored = this.data.get(before.id);
    if (
      !stored
      || stored.tenantId !== before.tenantId
      || stored.vehicleId
      || stored.holdCause
      || stored.lifecycleStatus !== before.lifecycleStatus
    ) {
      return false;
    }
    this.data.set(moved.id, moved);
    return true;
  }

  async findExistingImeis(imeis: string[]): Promise<Set<string>> {
    const wanted = new Set(imeis);
    return new Set(Array.from(this.data.values()).filter((device) => wanted.has(device.imei)).map((device) => device.imei));
  }

  async insertMany(devices: Device[]): Promise<number> {
    let stored = 0;
    for (const device of devices) {
      const taken = Array.from(this.data.values()).some(
        (held) => held.tenantId === device.tenantId && held.imei === device.imei,
      );
      if (taken) continue;
      this.data.set(device.id, device);
      stored += 1;
    }
    return stored;
  }

  async saveIfWaitingForVerification(device: Device): Promise<boolean> {
    const stored = this.data.get(device.id);
    if (stored?.tenantId !== device.tenantId || stored.verificationStatus !== "waiting") return false;
    this.data.set(device.id, device);
    return true;
  }

  async findAll(filters: DeviceFilters): Promise<Device[]> {
    const query = filters?.query?.trim().toLowerCase();

    return Array.from(this.data.values()).filter((device) => {
      if (device.tenantId !== filters.tenantId) {
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

  async findScoped(scope: Array<{ tenantId: string; deviceId: string }>): Promise<Device[]> {
    const wanted = new Set(scope.map((entry) => scopeKey(entry.tenantId, entry.deviceId)));
    return [...this.data.values()].filter((device) => wanted.has(scopeKey(device.tenantId, device.id)));
  }

  async findById(id: string, tenantId: string): Promise<Device | null> {
    const device = this.data.get(id);
    if (!device || device.tenantId !== tenantId) return null;
    return device;
  }

  async findAllAcrossTenants(): Promise<Device[]> {
    return Array.from(this.data.values());
  }

  async findByIdAcrossTenants(id: string): Promise<Device | null> {
    return this.data.get(id) ?? null;
  }

  async listLiveAfter(afterId: string | null, limit: number): Promise<Device[]> {
    return Array.from(this.data.values())
      .filter((device) => device.lifecycleStatus !== "decommissioned" && device.imei !== "" && device.id > (afterId ?? ""))
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limit);
  }

  async findLiveByImei(imei: string): Promise<Device | null> {
    const wanted = imei.trim();
    return (
      Array.from(this.data.values()).find(
        (device) => device.imei === wanted && device.lifecycleStatus !== "decommissioned",
      ) ?? null
    );
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

  async findProvisionRetryDue(now: Date, limit: number): Promise<Device[]> {
    return Array.from(this.data.values())
      .filter(
        (device) =>
          device.provisionStatus === "failed"
          && device.lifecycleStatus !== "decommissioned"
          && device.provisionNextAttemptAt !== null
          && Date.parse(device.provisionNextAttemptAt) <= now.getTime(),
      )
      .sort((a, b) => Date.parse(a.provisionNextAttemptAt ?? "") - Date.parse(b.provisionNextAttemptAt ?? ""))
      .slice(0, limit);
  }

  async requeueFailedProvisioning(ids: string[] | null, now: Date): Promise<number> {
    let requeued = 0;
    for (const device of this.data.values()) {
      if (device.provisionStatus !== "failed" || device.lifecycleStatus === "decommissioned") continue;
      if (ids && !ids.includes(device.id)) continue;
      this.data.set(
        device.id,
        device.withProvisioning({
          provisionStatus: "failed",
          provisionAttempts: 0,
          provisionNextAttemptAt: now.toISOString(),
          provisionError: null,
        }),
      );
      requeued++;
    }
    return requeued;
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const device = this.data.get(id);
    if (!device || device.tenantId !== tenantId) return;
    this.data.delete(id);
  }
}
