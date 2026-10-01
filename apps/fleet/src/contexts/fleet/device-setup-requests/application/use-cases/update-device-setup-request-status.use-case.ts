import { Inject, Injectable } from "@nestjs/common";
import { SETUP_REQUEST_PLATFORM_STATUSES } from "@shared/devices";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import type { DeviceSetupRequestStatus } from "../../domain/entities/device-setup-request.entity";
import {
  DEVICE_SETUP_REQUEST_REPOSITORY,
  type DeviceSetupRequestRepository,
} from "../../domain/repositories/device-setup-request.repository";

export type UpdateDeviceSetupRequestStatusCommand = {
  id: string;
  tenantId: string;
  status: DeviceSetupRequestStatus;
  note?: string | null;
};

@Injectable()
export class UpdateDeviceSetupRequestStatusUseCase {
  constructor(
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY)
    private readonly repository: DeviceSetupRequestRepository,
  ) {}

  async execute(command: UpdateDeviceSetupRequestStatusCommand) {
    assertTenantSettable(command.status);
    const request = await this.repository.findById(command.id, command.tenantId);
    if (!request) {
      throw new FleetRuleError(`device setup request ${command.id} not found`);
    }
    try {
      const updated = request.transitionTo(command.status, command.note ?? undefined);
      await this.repository.save(updated);
      return updated.toPrimitives();
    } catch (err) {
      throw new FleetRuleError((err as Error).message);
    }
  }
}

// Approval, rejection and payment are the platform's calls, made from its queue.
function assertTenantSettable(status: DeviceSetupRequestStatus) {
  if (SETUP_REQUEST_PLATFORM_STATUSES.includes(status)) {
    throw new FleetRuleError(`${status} is set by the platform, not by the tenant`);
  }
}
