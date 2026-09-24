import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { sweepSafely } from '@shared/observability';
import { SweepInstallationOrdersUseCase } from '@auth/installation/application/use-cases/sweep-installation-orders.use-case';

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class InstallationSweepScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(InstallationSweepScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(SweepInstallationOrdersUseCase) private readonly sweep: SweepInstallationOrdersUseCase,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== 'mikro-orm') return;
    this.timer = setInterval(() => sweepSafely(this.logger, 'installation_orders', () => this.tick()), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.sweep.run();
    } finally {
      this.running = false;
    }
  }
}
