import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  applyDeviceStatusFilter,
  type DeviceStatusFilter,
} from "../../domain/device-inventory";
import { heartbeatWindow } from "../../domain/device-heartbeat";
import type { DeviceLifecycleStatus } from "../../domain/entities/device.entity";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";

export const LAST_SEEN_BUCKETS = ["5min", "1hr", "24hr", "7day", "never"] as const;
export type LastSeenBucket = typeof LAST_SEEN_BUCKETS[number];

const LAST_SEEN_BUCKET_MS: Record<Exclude<LastSeenBucket, "never">, number> = {
  "5min": 5 * 60 * 1000,
  "1hr": 60 * 60 * 1000,
  "24hr": 24 * 60 * 60 * 1000,
  "7day": 7 * 24 * 60 * 60 * 1000,
};

export type ListDevicesFilters = {
  query?: string;
  manufacturer?: string;
  tenantId: string;
  /**
   * The status dropdown. Not a repository filter: `online`, `offline`,
   * `unassigned` and `unregistered` cut across the lifecycle, so the whole set is applied in the
   * domain to keep one definition behind the list, the cards and the filter.
   */
  statusFilter?: DeviceStatusFilter;
  lifecycleStatus?: DeviceLifecycleStatus;
  assigned?: boolean;
  vehicleId?: string;
  lastSeenBucket?: LastSeenBucket;
};

@Injectable()
export class ListDevicesUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(filters: ListDevicesFilters) {
    const { lastSeenBucket, statusFilter, ...rest } = filters;
    const resolved: Parameters<DeviceRepository["findAll"]>[0] = { ...rest };
    if (lastSeenBucket === "never") {
      resolved.lastSeenIsNull = true;
    } else if (lastSeenBucket) {
      resolved.lastSeenAfter = new Date(Date.now() - LAST_SEEN_BUCKET_MS[lastSeenBucket]);
    }
    const devices = await this.deviceRepository.findAll(resolved);
    return applyDeviceStatusFilter(
      devices.map((device) => device.toPrimitives()),
      statusFilter,
      heartbeatWindow(this.config.fleet.deviceOnlineThresholdSeconds),
    );
  }
}
