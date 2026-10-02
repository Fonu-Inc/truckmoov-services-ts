import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { runIfLockFree } from "@shared/db";
import { sweepSafely } from "@shared/observability";
import { RetryTraccarRegistrationsUseCase } from "./contexts/fleet/devices/application/use-cases/retry-traccar-registrations.use-case";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";

const SWEEP_INTERVAL_MS = 60_000;
const PROVISION_RETRY_LOCK_ID = 8_246_113_070_011;

/** One replica at a time retries failed Traccar registrations. */
@Injectable()
export class DeviceProvisionRetryService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DeviceProvisionRetryService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(RetryTraccarRegistrationsUseCase) private readonly retry: RetryTraccarRegistrationsUseCase,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== "mikro-orm") return;
    this.timer = setInterval(
      () => sweepSafely(this.logger, "device_provision_retry", () => this.run()),
      SWEEP_INTERVAL_MS,
    );
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const orm = await getFleetOrm(this.config.db);
      await runIfLockFree(orm, PROVISION_RETRY_LOCK_ID, () => this.retry.execute());
    } finally {
      this.running = false;
    }
  }
}
