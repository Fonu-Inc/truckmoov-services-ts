import { Inject, Injectable } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import type { DeviceSetupRequestStatus } from "../../domain/entities/device-setup-request.entity";
import {
  DEVICE_SETUP_REQUEST_REPOSITORY,
  type DeviceSetupRequestRepository,
} from "../../domain/repositories/device-setup-request.repository";

export type ListDeviceSetupRequestsFilters = {
  tenantId?: string;
  status?: DeviceSetupRequestStatus;
  query?: string;
};

@Injectable()
export class ListDeviceSetupRequestsUseCase {
  constructor(
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY)
    private readonly repository: DeviceSetupRequestRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
  ) {}

  async execute(filters?: ListDeviceSetupRequestsFilters) {
    const tenantId = filters?.tenantId ?? this.runtime.getDefaultTenantId();
    const requests = await this.repository.findAll({ ...filters, tenantId });
    return requests.map((request) => request.toPrimitives());
  }
}
