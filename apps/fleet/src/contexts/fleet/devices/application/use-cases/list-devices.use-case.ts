import { Inject, Injectable } from "@nestjs/common";
import type { DeviceLifecycleStatus, DeviceStatus } from "../../domain/entities/device.entity";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";

export type ListDevicesFilters = {
  query?: string;
  manufacturer?: string;
  tenantId?: string;
  status?: DeviceStatus;
  lifecycleStatus?: DeviceLifecycleStatus;
  assigned?: boolean;
  vehicleId?: string;
};

@Injectable()
export class ListDevicesUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
  ) {}

  async execute(filters?: ListDevicesFilters) {
    const devices = await this.deviceRepository.findAll(filters);
    return devices.map((device) => device.toPrimitives());
  }
}
