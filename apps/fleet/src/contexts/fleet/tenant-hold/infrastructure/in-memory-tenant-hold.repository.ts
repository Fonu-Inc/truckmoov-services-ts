import { Inject, Injectable } from "@nestjs/common";
import { DEVICE_REPOSITORY } from "../../devices/domain/repositories/device.repository";
import type { DeviceRepository } from "../../devices/domain/repositories/device.repository";
import { Device } from "../../devices/domain/entities/device.entity";
import {
  type DeviceChunkHandler,
  type FleetHoldCause,
  type HeldDevice,
  type HoldCounts,
  type TenantHoldRepository,
} from "../domain/tenant-hold.repository";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";

const toHeld = (device: Device, cause: FleetHoldCause | null): HeldDevice => ({
  id: device.id,
  tenantId: device.tenantId,
  imei: device.imei,
  manufacturer: device.manufacturer,
  model: device.model,
  vehicleId: device.vehicleId,
  cause,
});

/** Share links are not held here: the in-memory link store has no tenant listing. */
@Injectable()
export class InMemoryTenantHoldRepository implements TenantHoldRepository {
  private readonly heldVehicles = new Map<string, FleetHoldCause>();

  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
  ) {}

  async hold(tenantId: string, cause: FleetHoldCause, _reason: string, onDevices: DeviceChunkHandler): Promise<HoldCounts> {
    const free = (await this.devices.findAll({ tenantId })).filter((device) => device.holdCause === null);
    await this.setCause(free, cause);
    if (free.length) await onDevices(free.map((device) => toHeld(device, cause)));
    const vehicles = (await this.vehicles.findAll({ tenantId })).filter((vehicle) => !this.heldVehicles.has(vehicle.id));
    vehicles.forEach((vehicle) => this.heldVehicles.set(vehicle.id, cause));
    return { devices: free.length, vehicles: vehicles.length, shareLinks: 0 };
  }

  async release(tenantId: string, causes: FleetHoldCause[], onDevices: DeviceChunkHandler): Promise<HoldCounts> {
    const held = (await this.devices.findAll({ tenantId })).filter(
      (device) => device.holdCause !== null && causes.includes(device.holdCause),
    );
    await this.setCause(held, null);
    if (held.length) await onDevices(held.map((device) => toHeld(device, null)));
    const vehicles = (await this.vehicles.findAll({ tenantId })).filter((vehicle) => {
      const cause = this.heldVehicles.get(vehicle.id);
      return cause !== undefined && causes.includes(cause);
    });
    vehicles.forEach((vehicle) => this.heldVehicles.delete(vehicle.id));
    return { devices: held.length, vehicles: vehicles.length, shareLinks: 0 };
  }

  async retag(tenantId: string, from: FleetHoldCause, to: FleetHoldCause, onDevices: DeviceChunkHandler): Promise<void> {
    const moved = (await this.devices.findAll({ tenantId })).filter((device) => device.holdCause === from);
    await this.setCause(moved, to);
    if (moved.length) await onDevices(moved.map((device) => toHeld(device, to)));
    for (const [id, cause] of this.heldVehicles) if (cause === from) this.heldVehicles.set(id, to);
  }

  async preview(tenantIds: string[]): Promise<Array<{ tenantId: string } & HoldCounts>> {
    return Promise.all(
      tenantIds.map(async (tenantId) => ({
        tenantId,
        devices: (await this.devices.findAll({ tenantId })).filter((device) => device.holdCause === null).length,
        vehicles: (await this.vehicles.findAll({ tenantId })).filter((vehicle) => !this.heldVehicles.has(vehicle.id)).length,
        shareLinks: 0,
      })),
    );
  }

  async listHeldDevices(limit: number, afterId: string | null): Promise<HeldDevice[]> {
    return (await this.devices.findAllAcrossTenants())
      .filter((device) => device.holdCause !== null && device.id > (afterId ?? ""))
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((device) => toHeld(device, device.holdCause));
  }

  private async setCause(devices: Device[], cause: FleetHoldCause | null): Promise<void> {
    for (const device of devices) {
      await this.devices.save(Device.create({ ...device.toPrimitives(), holdCause: cause }));
    }
  }
}
