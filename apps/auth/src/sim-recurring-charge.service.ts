import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import { runIfLockFree } from '@shared/db';
import { sweepSafely } from '@shared/observability';
import { ChargeUsageUseCase, InsufficientWalletBalanceError } from './charge-usage.use-case';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SIM_SWEEP_LOCK_ID = 8_246_113_070_002;

type SweepSummary = { tenants: number; charged: number };
const EMPTY_SWEEP: SweepSummary = { tenants: 0, charged: 0 };

/**
 * Charges each tenant once a month for their active SIMs.
 *
 * A recurring monthly charge is a different mechanism from a per-event one: it
 * is driven by a clock and a count, not by something happening. The panel
 * described this rate as "per active SIM per month" while labelling it "per
 * message", and only one of those can exist — this is the monthly one.
 *
 * The reference is the wallet idempotency key (via ChargeUsageUseCase), so a repeat sweep in
 * the same month replays the original debit instead of charging again. A
 * Postgres advisory lock keeps the sweep to one replica at a time.
 */
@Injectable()
export class SimRecurringChargeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SimRecurringChargeService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly reportedFailures = new Set<string>();

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(ChargeUsageUseCase) private readonly chargeUsage: ChargeUsageUseCase,
    @Inject(SIM_REPOSITORY) private readonly sims: SimRepository,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== 'mikro-orm') return;
    // Runs more often than monthly on purpose: the billing month in the
    // reference is what makes it once-per-month, so a frequent sweep simply
    // catches tenants whose charge has not landed yet.
    this.timer = setInterval(
      () => sweepSafely(this.logger, 'sim_recurring_charge', () => this.run()),
      SWEEP_INTERVAL_MS,
    );
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<SweepSummary> {
    if (this.running) return EMPTY_SWEEP;
    this.running = true;

    try {
      return await this.exclusively(() => this.sweep());
    } finally {
      this.running = false;
    }
  }

  private async exclusively(task: () => Promise<SweepSummary>): Promise<SweepSummary> {
    if (this.config.persistence.backend !== 'mikro-orm') return task();

    const orm = await getAuthOrm(this.config.db);
    const result = await runIfLockFree(orm, SIM_SWEEP_LOCK_ID, task);
    return result.acquired ? result.value : EMPTY_SWEEP;
  }

  private async sweep(): Promise<SweepSummary> {
    const counts = await this.sims.countActiveByTenant();
    const month = billingMonth(new Date());
    let charged = 0;

    for (const { tenantId, activeSims } of counts) {
      if (activeSims === 0) continue;
      if (await this.chargeTenant(tenantId, activeSims, month)) charged += 1;
    }

    return { tenants: counts.length, charged };
  }

  private async chargeTenant(tenantId: string, activeSims: number, month: string): Promise<boolean> {
    const reference = `sim-monthly:${tenantId}:${month}`;

    try {
      const result = await this.chargeUsage.execute({
        tenantId,
        channel: 'iot_sim',
        quantity: activeSims,
        reason: `IoT SIM connectivity for ${activeSims} active SIM(s), ${month}`,
        reference,
      });
      return result.charged && !result.replayed;
    } catch (error) {
      this.logFailureOnce(reference, tenantId, error);
      return false;
    }
  }

  private logFailureOnce(reference: string, tenantId: string, error: unknown): void {
    if (this.reportedFailures.has(reference)) return;
    this.reportedFailures.add(reference);

    const reason =
      error instanceof InsufficientWalletBalanceError
        ? 'insufficient_funds'
        : error instanceof Error
          ? error.message
          : 'unknown';
    this.logger.warn(`sim_monthly_charge_failed:${tenantId}:${reason}`);
  }
}

/** The month a charge belongs to, used as the idempotency key. */
export function billingMonth(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}
