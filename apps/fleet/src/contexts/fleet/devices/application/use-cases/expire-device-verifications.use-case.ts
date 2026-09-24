import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../domain/repositories/device.repository";
import { RecordVerificationFailureUseCase } from "./record-verification-failure.use-case";

/** Bounds one pass so a large backlog cannot hold the loop open. */
const SWEEP_BATCH_SIZE = 200;

/**
 * Closes waiting windows that ran out.
 *
 * Verification has no negative signal: a device that is misconfigured sends
 * nothing at all, and nothing at all looks the same as a device still being
 * fitted. The deadline is what separates them, and this is what reads it.
 */
@Injectable()
export class ExpireDeviceVerificationsUseCase {
  private readonly logger = new Logger(ExpireDeviceVerificationsUseCase.name);

  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(RecordVerificationFailureUseCase)
    private readonly recordFailure: RecordVerificationFailureUseCase,
  ) {}

  async execute(now = new Date()): Promise<{ expired: number }> {
    const due = await this.devices.findAwaitingVerificationPastDeadline(
      now,
      SWEEP_BATCH_SIZE,
    );

    let expired = 0;
    for (const device of due) {
      const failed = await this.recordFailure.expire({
        device,
        reason: "timeout",
        detail: `no telemetry within the verification window (deadline ${device.verificationDeadline})`,
        at: now.toISOString(),
      });
      if (failed) expired += 1;
    }

    if (expired > 0) {
      this.logger.warn(`device_verification_expired:${expired}`);
    }
    return { expired };
  }
}
