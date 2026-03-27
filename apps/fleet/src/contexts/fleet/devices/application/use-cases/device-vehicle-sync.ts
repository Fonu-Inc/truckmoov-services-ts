import type { Device } from "../../domain/entities/device.entity";

export function buildVehicleGpsSnapshot(device: Device, installedAt?: string | null) {
  return {
    imei: device.imei,
    manufacturer: device.manufacturer,
    model: device.model,
    firmwareVersion: device.firmwareVersion,
    installedAt: installedAt ?? device.assignedAt ?? new Date().toISOString(),
  };
}
