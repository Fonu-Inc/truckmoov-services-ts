import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { ChargeUsageUseCase } from './charge-usage.use-case';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Charges each tenant once a month for their active SIMs.
 *
 * A recurring monthly charge is a different mechanism from a per-event one: it
 * is driven by a clock and a count, not by something happening. The panel
 * described this rate as "per active SIM per month" while labelling it "per
 * message", and only one of those can exist — this is the monthly one.
 *
 * The reference is the tenant and the billing month, so a sweep that runs twice
 * writes the same reference twice and the second is refused as a duplicate
 * rather than charging again.
 */
@Injectable()
export class SimRecurringChargeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SimRecurringChargeService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

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
    this.timer = setInterval(() => void this.run(), SWEEP_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<{ tenants: number; charged: number }> {
    if (this.running) return { tenants: 0, charged: 0 };
    this.running = true;

    try {
      const counts = await this.countActiveSimsByTenant();
      const month = billingMonth(new Date());
      let charged = 0;

      for (const { tenantId, activeSims } of counts) {
        if (activeSims === 0) continue;

        try {
          const result = await this.chargeUsage.execute({
            tenantId,
            channel: 'iot_sim',
            quantity: activeSims,
            reason: `IoT SIM connectivity for ${activeSims} active SIM(s), ${month}`,
            reference: `sim-monthly:${tenantId}:${month}`,
          });
          if (result.charged) charged += 1;
        } catch (error) {
          // One tenant short of funds must not stop the rest being charged.
          this.logger.warn(
            `sim_monthly_charge_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
          );
        }
      }

      return { tenants: counts.length, charged };
    } finally {
      this.running = false;
    }
  }

  /**
   * Active SIMs per tenant. Read through the repository's own filters rather
   * than a raw query, so the definition of "active" stays in one place.
   */
  private async countActiveSimsByTenant(): Promise<
    Array<{ tenantId: string; activeSims: number }>
  > {
    const { items } = await this.sims.findAll({ status: 'active', limit: 100_000 });
    const byTenant = new Map<string, number>();

    for (const sim of items) {
      if (!sim.tenantId) continue;
      byTenant.set(sim.tenantId, (byTenant.get(sim.tenantId) ?? 0) + 1);
    }

    return [...byTenant.entries()].map(([tenantId, activeSims]) => ({ tenantId, activeSims }));
  }
}

/** The month a charge belongs to, used as the idempotency key. */
export function billingMonth(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}
