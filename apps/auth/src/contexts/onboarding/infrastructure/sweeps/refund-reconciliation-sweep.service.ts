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
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
  type StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import { RefundReconciliationService } from '@auth/onboarding/application/services/refund-reconciliation.service';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 5 * 60 * 1000;
const BATCH_SIZE = 100;
export const REFUND_RECONCILIATION_LOCK_ID = 8_246_113_070_022;

type SweepSummary = { checked: number; settled: number; released: number };
const EMPTY_SWEEP: SweepSummary = { checked: 0, settled: 0, released: 0 };

@Injectable()
export class RefundReconciliationSweep implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RefundReconciliationSweep.name);
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
    @Inject(RefundReconciliationService)
    private readonly reconciliation: RefundReconciliationService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== 'mikro-orm') return;
    const run = () => sweepSafely(this.logger, 'refund_reconciliation', () => this.run());
    this.firstRun = setTimeout(run, FIRST_SWEEP_DELAY_MS);
    this.timer = setInterval(run, SWEEP_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
  }

  async run(now: Date = new Date()): Promise<SweepSummary> {
    if (this.running) return EMPTY_SWEEP;
    this.running = true;
    try {
      return await this.exclusively(() => this.sweep(now));
    } finally {
      this.running = false;
    }
  }

  private async exclusively(task: () => Promise<SweepSummary>): Promise<SweepSummary> {
    if (this.config.persistence.backend !== 'mikro-orm') return task();
    const orm = await getAuthOrm(this.config.db);
    const result = await runIfLockFree(orm, REFUND_RECONCILIATION_LOCK_ID, task);
    return result.acquired ? result.value : EMPTY_SWEEP;
  }

  private async sweep(now: Date): Promise<SweepSummary> {
    const stale = await this.payments.findStaleRefundClaims(this.reconciliation.staleBefore(now), BATCH_SIZE);
    const summary = { ...EMPTY_SWEEP, checked: stale.length };
    for (const payment of stale) {
      const outcome = await this.reconcileOne(payment, now);
      if (outcome === 'settled') summary.settled += 1;
      if (outcome === 'released') summary.released += 1;
    }
    if (stale.length > 0) {
      this.logger.log(
        `refund_reconciliation_sweep:checked=${summary.checked}:settled=${summary.settled}:released=${summary.released}`,
      );
    }
    return summary;
  }

  private async reconcileOne(payment: StoredOnboardingPayment, now: Date): Promise<string> {
    try {
      return await this.reconciliation.reconcile(payment, now);
    } catch (error) {
      this.logger.error(
        `refund_reconciliation_failed:${payment.reference}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return 'error';
    }
  }
}
