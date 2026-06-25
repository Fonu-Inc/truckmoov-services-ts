import { Inject, Injectable } from "@nestjs/common";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import {
  DEVICE_SETUP_REQUEST_REPOSITORY,
  type DeviceSetupRequestRepository,
} from "../../domain/repositories/device-setup-request.repository";

@Injectable()
export class GetDeviceSetupRequestUseCase {
  constructor(
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY)
    private readonly repository: DeviceSetupRequestRepository,
  ) {}

  async execute(id: string) {
    const request = await this.repository.findById(id);
    if (!request) {
      throw new FleetRuleError(`device setup request ${id} not found`);
    }
    return request.toPrimitives();
  }
}
