import { Inject, Injectable } from "@nestjs/common";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";
import type { Device } from "../../domain/entities/device.entity";

export type DeviceIdentity = {
  imei: string;
  tenantId: string;
  vehicleId: string | null;
  deviceId: string;
  status: string;
};

const toIdentity = (device: Device): DeviceIdentity => ({
  imei: device.imei,
  tenantId: device.tenantId,
  vehicleId: device.vehicleId ?? null,
  deviceId: device.id,
  status: device.status,
});

/** The source of truth for tracking's IMEI cache: snapshot pages and single read-through lookups. */
@Injectable()
export class DeviceIdentityDirectory {
  constructor(@Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository) {}

  async page(limit: number, cursor: string | null) {
    const rows = await this.devices.listLiveAfter(cursor, limit);
    return {
      identities: rows.map(toIdentity),
      nextCursor: rows.length === limit ? rows[rows.length - 1].id : null,
    };
  }

  async byImei(imei: string): Promise<DeviceIdentity | null> {
    const device = await this.devices.findLiveByImei(imei);
    return device ? toIdentity(device) : null;
  }
}
