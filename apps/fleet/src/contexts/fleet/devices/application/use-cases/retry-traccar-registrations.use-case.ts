import { Inject, Injectable, Logger } from "@nestjs/common";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";
import {
  TRACCAR_DEVICE_PROVISIONER,
  type TraccarDeviceProvisioner,
} from "../../domain/ports/traccar-device.port";
import type { Device } from "../../domain/entities/device.entity";
import { withFailedProvisioning, withRegisteredProvisioning } from "../../domain/provision-retry";

const SWEEP_BATCH_SIZE = 50;

export type ProvisionRetrySummary = { retried: number; registered: number; failed: number };

/**
 * Tries again for devices whose Traccar registration failed. Without this a
 * Traccar outage at registration time leaves the device unable to report for
 * good, with nothing to say so.
 */
@Injectable()
export class RetryTraccarRegistrationsUseCase {
  private readonly logger = new Logger(RetryTraccarRegistrationsUseCase.name);

  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(TRACCAR_DEVICE_PROVISIONER) private readonly traccar: TraccarDeviceProvisioner,
  ) {}

  async execute(now = new Date()): Promise<ProvisionRetrySummary> {
    const due = await this.devices.findProvisionRetryDue(now, SWEEP_BATCH_SIZE);
    const summary: ProvisionRetrySummary = { retried: due.length, registered: 0, failed: 0 };

    for (const device of due) {
      const registered = await this.retryOne(device, now);
      if (registered) summary.registered += 1;
      else summary.failed += 1;
    }

    if (due.length > 0) {
      this.logger.log(`traccar_registration_retried:${due.length}:ok=${summary.registered}:failed=${summary.failed}`);
    }
    return summary;
  }

  private async retryOne(device: Device, now: Date): Promise<boolean> {
    try {
      const result = await this.traccar.register({
        imei: device.imei,
        name: `${device.manufacturer} ${device.model} (${device.imei})`,
      });
      if (!result) throw new Error("traccar registration is not configured");
      await this.devices.save(withRegisteredProvisioning(device, result.traccarDeviceId));
      return true;
    } catch (error) {
      const failed = withFailedProvisioning(device, error, now);
      await this.devices.save(failed);
      if (failed.provisionNextAttemptAt === null) {
        this.logger.error(`traccar_registration_gave_up:${device.id}:${failed.provisionAttempts}`);
      }
      return false;
    }
  }
}
