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
import {
  RenewalInvoiceService,
  type RenewalRunSummary,
} from '@auth/onboarding/application/services/renewal-invoice.service';
import { PayRenewalFromWalletUseCase } from '@auth/onboarding/application/use-cases/billing/pay-renewal.use-cases';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';

export const RENEWAL_SWEEP_LOCK_ID = 8_246_113_070_004;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;

const EMPTY: RenewalRunSummary = { seeded: 0, cancelled: 0, repriced: 0, issued: 0, failed: 0 };

@Injectable()
export class RenewalSweepService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RenewalSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private starter: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(RenewalInvoiceService) private readonly renewals: RenewalInvoiceService,
    @Inject(PayRenewalFromWalletUseCase) private readonly walletRenewals: PayRenewalFromWalletUseCase,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== 'mikro-orm') return;
    const tick = () => sweepSafely(this.logger, 'renewal', () => this.run());
    this.starter = setTimeout(() => {
      void tick();
      this.timer = setInterval(tick, SWEEP_INTERVAL_MS);
    }, FIRST_RUN_DELAY_MS);
  }

  onApplicationShutdown(): void {
    if (this.starter) clearTimeout(this.starter);
    if (this.timer) clearInterval(this.timer);
  }

  async run(now: Date = new Date()): Promise<RenewalRunSummary> {
    if (this.running) return EMPTY;
    this.running = true;
    try {
      const summary = await this.exclusively(async () => {
        const result = await this.renewals.run(now);
        await this.walletRenewals.recoverStale(now);
        return result;
      });
      this.logger.log(`renewal_sweep:${JSON.stringify(summary)}`);
      return summary;
    } finally {
      this.running = false;
    }
  }

  private async exclusively(task: () => Promise<RenewalRunSummary>): Promise<RenewalRunSummary> {
    if (this.config.persistence.backend !== 'mikro-orm') return task();
    const orm = await getAuthOrm(this.config.db);
    const result = await runIfLockFree(orm, RENEWAL_SWEEP_LOCK_ID, task);
    return result.acquired ? result.value : EMPTY;
  }
}
