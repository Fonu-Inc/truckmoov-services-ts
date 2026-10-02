import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { runIfLockFree } from '@shared/db';
import { sweepSafely } from '@shared/observability';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import { SIM_USAGE_REPOSITORY, lagosDayKey, type SimUsageRepository } from './sim-usage.repository';

export const SIM_USAGE_SNAPSHOT_LOCK_ID = 8_246_113_070_005;
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 90 * 1000;

@Injectable()
export class SimUsageSnapshotService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SimUsageSnapshotService.name);
  private timer: NodeJS.Timeout | null = null;
  private starter: NodeJS.Timeout | null = null;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(SIM_USAGE_REPOSITORY) private readonly usage: SimUsageRepository,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== 'mikro-orm') return;
    const tick = () => sweepSafely(this.logger, 'sim_usage_snapshot', () => this.run());
    this.starter = setTimeout(() => {
      void tick();
      this.timer = setInterval(tick, SNAPSHOT_INTERVAL_MS);
    }, FIRST_RUN_DELAY_MS);
  }

  onApplicationShutdown(): void {
    if (this.starter) clearTimeout(this.starter);
    if (this.timer) clearInterval(this.timer);
  }

  /** Each run rewrites today's row, so the last run of a Lagos day is its end-of-day figure. */
  async run(now: Date = new Date()): Promise<void> {
    if (this.config.persistence.backend !== 'mikro-orm') return this.capture(now);
    const orm = await getAuthOrm(this.config.db);
    await runIfLockFree(orm, SIM_USAGE_SNAPSHOT_LOCK_ID, () => this.capture(now));
  }

  async capture(now: Date = new Date()): Promise<void> {
    await this.usage.saveSnapshot(lagosDayKey(now), await this.usage.currentTotals(), now);
  }
}
