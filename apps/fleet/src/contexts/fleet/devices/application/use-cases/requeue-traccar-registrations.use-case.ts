import { Inject, Injectable, Logger } from "@nestjs/common";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";

/**
 * Gives failed Traccar registrations a fresh set of attempts, for devices that
 * gave up while Traccar was unreachable or misconfigured. The existing sweeper
 * does the retrying; this only makes the devices due again.
 */
@Injectable()
export class RequeueTraccarRegistrationsUseCase {
  private readonly logger = new Logger(RequeueTraccarRegistrationsUseCase.name);

  constructor(@Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository) {}

  /** Omitted or empty `deviceIds` means every failed device. */
  async execute(deviceIds?: string[], now = new Date()): Promise<{ requeued: number }> {
    const ids = deviceIds && deviceIds.length > 0 ? deviceIds : null;
    const requeued = await this.devices.requeueFailedProvisioning(ids, now);

    this.logger.log(`traccar_registration_requeued:${requeued}`);
    return { requeued };
  }
}
