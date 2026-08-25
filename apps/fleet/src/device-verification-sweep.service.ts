import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { ExpireDeviceVerificationsUseCase } from "./contexts/fleet/devices/application/use-cases/expire-device-verifications.use-case";

/**
 * Turns a closed waiting window into a failed verification.
 *
 * The screen shows a device as "Waiting…" with a pulsing dot. Without this it
 * pulses for ever: no packet arrives to say the device is broken, only the
 * absence of one, and absence needs a clock to become a fact.
 */
@Injectable()
export class DeviceVerificationSweepService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DeviceVerificationSweepService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(ExpireDeviceVerificationsUseCase)
    private readonly expire: ExpireDeviceVerificationsUseCase,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = this.config.fleet.deviceVerificationSweepSeconds * 1000;
    this.timer = setInterval(() => void this.run(), intervalMs);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    try {
      await this.expire.execute();
    } catch (error) {
      this.logger.warn(
        `device_verification_sweep_failed:${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
}
