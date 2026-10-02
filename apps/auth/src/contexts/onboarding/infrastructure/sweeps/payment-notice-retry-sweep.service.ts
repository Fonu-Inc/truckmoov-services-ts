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
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  ApplicationPaymentNoticeService,
  PAYMENT_NOTICE_MAX_ATTEMPTS,
} from '@auth/onboarding/application/services/application-payment-notice.service';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 5 * 60 * 1000;
const BACKOFF_STEP_MS = 15 * 60 * 1000;
const BATCH_SIZE = 100;
export const PAYMENT_NOTICE_RETRY_LOCK_ID = 8_246_113_070_023;

type SweepSummary = { due: number; sent: number };
const EMPTY_SWEEP: SweepSummary = { due: 0, sent: 0 };

/** Retries payment-open emails that failed, with a growing wait, until staff are alerted. */
@Injectable()
export class PaymentNoticeRetrySweep implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PaymentNoticeRetrySweep.name);
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ApplicationPaymentNoticeService)
    private readonly notices: ApplicationPaymentNoticeService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== 'mikro-orm') return;
    const run = () => sweepSafely(this.logger, 'payment_notice_retry', () => this.run());
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
    const result = await runIfLockFree(orm, PAYMENT_NOTICE_RETRY_LOCK_ID, task);
    return result.acquired ? result.value : EMPTY_SWEEP;
  }

  private async sweep(now: Date): Promise<SweepSummary> {
    const pending = await this.applications.findPaymentNoticePending(PAYMENT_NOTICE_MAX_ATTEMPTS, BATCH_SIZE);
    const due = pending.filter((application) => this.isDue(application, now));
    let sent = 0;
    for (const application of due) {
      if ((await this.notices.retryPaymentOpen(application.id, now)) === 'sent') sent += 1;
    }
    if (due.length > 0) this.logger.log(`payment_notice_retry_sweep:due=${due.length}:sent=${sent}`);
    return { due: due.length, sent };
  }

  private isDue(application: StoredOnboardingApplication, now: Date): boolean {
    const last = application.paymentNoticeAttemptedAt;
    if (!last) return true;
    const attempts = Math.max(application.paymentNoticeAttempts ?? 0, 1);
    return now.getTime() - last.getTime() >= attempts * BACKOFF_STEP_MS;
  }
}
