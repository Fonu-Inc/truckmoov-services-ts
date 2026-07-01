import { Inject, Injectable } from "@nestjs/common";
import type { DeviceLifecycleStatus, DeviceStatus } from "../../domain/entities/device.entity";
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
  tenantId?: string;
  status?: DeviceStatus;
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
  ) {}

  async execute(filters?: ListDevicesFilters) {
    const { lastSeenBucket, ...rest } = filters ?? {};
    const resolved: Parameters<DeviceRepository["findAll"]>[0] = { ...rest };
    if (lastSeenBucket === "never") {
      resolved.lastSeenIsNull = true;
    } else if (lastSeenBucket) {
      resolved.lastSeenAfter = new Date(Date.now() - LAST_SEEN_BUCKET_MS[lastSeenBucket]);
    }
    const devices = await this.deviceRepository.findAll(resolved);
    return devices.map((device) => device.toPrimitives());
  }
}
