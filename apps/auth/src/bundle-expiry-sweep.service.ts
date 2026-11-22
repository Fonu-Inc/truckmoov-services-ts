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
import { BUNDLE_ALLOCATION_REPOSITORY, type BundleAllocationRepository } from './bundle-allocation.repository';

export const BUNDLE_EXPIRY_SWEEP_LOCK_ID = 8_246_113_070_008;
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 75 * 1000;

/** Moves data-bundle allocations past their expiry from active to expired. */
@Injectable()
export class BundleExpirySweepService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BundleExpirySweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private starter: NodeJS.Timeout | null = null;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(BUNDLE_ALLOCATION_REPOSITORY) private readonly allocations: BundleAllocationRepository,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== 'mikro-orm') return;
    const tick = () => sweepSafely(this.logger, 'bundle_expiry', () => this.run());
    this.starter = setTimeout(() => {
      void tick();
      this.timer = setInterval(tick, SWEEP_INTERVAL_MS);
    }, FIRST_RUN_DELAY_MS);
  }

  onApplicationShutdown(): void {
    if (this.starter) clearTimeout(this.starter);
    if (this.timer) clearInterval(this.timer);
  }

  async run(now: Date = new Date()): Promise<number> {
    if (this.config.persistence.backend !== 'mikro-orm') return this.expire(now);
    const orm = await getAuthOrm(this.config.db);
    const result = await runIfLockFree(orm, BUNDLE_EXPIRY_SWEEP_LOCK_ID, () => this.expire(now));
    return result.acquired ? result.value : 0;
  }

  private async expire(now: Date): Promise<number> {
    const expired = await this.allocations.expireDue(now);
    this.logger.log(`bundle_expiry_sweep:${JSON.stringify({ expired })}`);
    return expired;
  }
}
