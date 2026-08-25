import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import type { Device } from "../../domain/entities/device.entity";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../domain/repositories/device.repository";

export type StartDeviceVerificationCommand = {
  tenantId: string;
  deviceId: string;
};

/**
 * Opens the waiting window on a configured device.
 *
 * Nothing is checked here. The platform cannot make a tracker report, so this
 * writes down that we are waiting and until when. The device reporting closes
 * the window; the deadline passing without it is what makes the attempt a
 * failure.
 */
@Injectable()
export class StartDeviceVerificationUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(command: StartDeviceVerificationCommand): Promise<Device> {
    const device = await this.devices.findById(command.deviceId, command.tenantId);
    if (!device) throw new DeviceNotFoundError(command.deviceId);

    const now = new Date();
    const deadline = new Date(
      now.getTime() + this.config.fleet.deviceVerificationWindowMinutes * 60_000,
    );

    const waiting = device.beginVerification({
      deadline: deadline.toISOString(),
      at: now.toISOString(),
    });
    await this.devices.save(waiting);
    return waiting;
  }
}
