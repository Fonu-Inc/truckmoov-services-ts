import { Inject, Injectable } from "@nestjs/common";
import { buildQuotaAllowance } from "../../../shared/domain/allowance";
import {
  DEVICE_LAST_SEEN_FILTERS,
  deviceStatusFilterOptions,
  summarizeDeviceStatuses,
  type DeviceInventoryRow,
} from "../../domain/device-inventory";
import {
  DEVICE_QUOTA_READER,
  type DeviceQuotaReader,
} from "../../domain/ports/device-quota-reader.port";
import { DEVICE_CATALOG_PORT, type DeviceCatalogPort } from "../../domain/ports/device-catalog.port";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";

@Injectable()
export class DeviceInventorySummaryUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(DEVICE_QUOTA_READER) private readonly quota: DeviceQuotaReader,
  ) {}

  async execute(tenantId: string) {
    const [devices, limit] = await Promise.all([
      this.devices.findAll({ tenantId }),
      this.quota.findDeviceLimit(tenantId),
    ]);

    const counts = summarizeDeviceStatuses(devices.map(toRow));

    return {
      ...counts,
      // Every registered device holds a plan seat, including a suspended or
      // faulty one. A seat is released by deleting the device, not by taking it
      // out of service.
      allowance: buildQuotaAllowance(limit, devices.length),
    };
  }
}

@Injectable()
export class DeviceFilterOptionsUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(DEVICE_CATALOG_PORT) private readonly catalog: DeviceCatalogPort,
  ) {}

  /**
   * The Filter panel. Manufacturers come from the catalogue and from what the
   * tenant actually holds: a device registered before its model was deprecated
   * must still be filterable, and a catalogue entry nobody owns yet is still
   * worth offering.
   */
  async execute(tenantId: string) {
    const [devices, models] = await Promise.all([
      this.devices.findAll({ tenantId }),
      this.catalog.findAll().catch(() => []),
    ]);

    const manufacturers = new Set<string>();
    for (const model of models) manufacturers.add(model.manufacturer);
    for (const device of devices) manufacturers.add(device.manufacturer);

    return {
      statuses: deviceStatusFilterOptions(),
      manufacturers: [...manufacturers].sort((a, b) => a.localeCompare(b)),
      lastSeen: DEVICE_LAST_SEEN_FILTERS.map((option) => ({ ...option })),
    };
  }
}

function toRow(device: DeviceInventoryRow): DeviceInventoryRow {
  return {
    lifecycleStatus: device.lifecycleStatus,
    vehicleId: device.vehicleId,
    provisionStatus: device.provisionStatus,
    lastSeen: device.lastSeen,
  };
}
