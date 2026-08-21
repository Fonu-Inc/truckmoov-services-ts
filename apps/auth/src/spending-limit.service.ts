import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import {
  SPENDING_LIMIT_REPOSITORY,
  type SpendingLimitRepository,
  type StoredSpendingLimit,
} from './spending-limit.repository';

export class SpendingLimitExceededError extends Error {
  constructor(
    readonly limitKobo: number,
    readonly spentKobo: number,
    readonly attemptedKobo: number,
  ) {
    super(
      `This spend would take the month to ${(spentKobo + attemptedKobo) / 100} against a limit of ${limitKobo / 100}`,
    );
  }
}

/**
 * Enforces the tenant's monthly spending cap.
 *
 * The window does not follow the calendar month. It opens on a day the tenant
 * chooses, so "this month" here differs from the calendar month the summary
 * figures use. Both appear on one screen, and they are not the same number.
 */
@Injectable()
export class SpendingLimitService {
  private readonly logger = new Logger(SpendingLimitService.name);

  constructor(
    @Inject(SPENDING_LIMIT_REPOSITORY)
    private readonly repository: SpendingLimitRepository,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  /**
   * Refuses a spend that would carry the window past the cap. Called before the
   * money moves, so a refused spend leaves the balance untouched.
   */
  async assertWithinLimit(tenantId: string, amountKobo: number): Promise<void> {
    const settings = await this.repository.findByTenantId(tenantId);
    if (!settings || !settings.enabled) return;

    const current = this.rollWindowForward(settings);
    if (current.spentThisMonthKobo + amountKobo > current.monthlyLimitKobo) {
      throw new SpendingLimitExceededError(
        current.monthlyLimitKobo,
        current.spentThisMonthKobo,
        amountKobo,
      );
    }
  }

  /**
   * Adds a completed spend to the window total, then announces any threshold it
   * crossed. Each threshold is announced once per window.
   */
  async recordSpend(tenantId: string, amountKobo: number): Promise<void> {
    const settings = await this.repository.findByTenantId(tenantId);
    if (!settings || !settings.enabled) return;

    const current = this.rollWindowForward(settings);
    const spentThisMonthKobo = current.spentThisMonthKobo + amountKobo;

    const crossed = this.thresholdsCrossed(current, spentThisMonthKobo);
    const notifiedPercentages = [...current.notifiedPercentages, ...crossed];

    await this.repository.save({
      ...current,
      spentThisMonthKobo,
      notifiedPercentages,
      updatedAt: new Date(),
    });

    for (const percentage of crossed) {
      await this.announce(tenantId, percentage, spentThisMonthKobo, current.monthlyLimitKobo);
    }
  }

  /**
   * Returns the settings with the window advanced if it has rolled over. A new
   * window clears the total and the announced thresholds, so the next window
   * starts from zero and can announce again.
   */
  private rollWindowForward(settings: StoredSpendingLimit): StoredSpendingLimit {
    const windowStart = windowStartFor(settings.resetDayOfMonth, new Date());
    if (settings.windowStartedOn === windowStart) return settings;

    return {
      ...settings,
      windowStartedOn: windowStart,
      spentThisMonthKobo: 0,
      notifiedPercentages: [],
    };
  }

  private thresholdsCrossed(settings: StoredSpendingLimit, spentKobo: number): number[] {
    if (settings.monthlyLimitKobo <= 0) return [];
    const reached = (spentKobo / settings.monthlyLimitKobo) * 100;

    return settings.notifyAtPercentages
      .filter((percentage) => reached >= percentage)
      .filter((percentage) => !settings.notifiedPercentages.includes(percentage))
      .sort((a, b) => a - b);
  }

  private async announce(
    tenantId: string,
    percentage: number,
    spentKobo: number,
    limitKobo: number,
  ): Promise<void> {
    try {
      await this.bus.publish(`tm.${tenantId}.spending.limit.reached`, {
        id: randomUUID(),
        type: 'spending.limit.reached',
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: tenantId,
        data: {
          threshold_percentage: percentage,
          spent_kobo: spentKobo,
          limit_kobo: limitKobo,
          blocked: percentage >= 100,
        },
      });
    } catch (error) {
      this.logger.warn(
        `spending_limit_announce_failed:tenant=${tenantId}:${(error as Error).message}`,
      );
    }
  }
}

/**
 * First day of the window that contains `now`, as YYYY-MM-DD.
 *
 * A reset day past the end of a short month falls on that month's last day, so
 * a tenant who chose 31 still gets one window in February.
 *
 * The date is taken in the platform timezone rather than UTC, because a window
 * evaluated in UTC would open on the wrong day either side of midnight. There
 * is no per-tenant timezone to use yet.
 */
export function windowStartFor(
  resetDayOfMonth: number,
  now: Date,
  timeZone = 'Africa/Lagos',
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);

  const resetDay = Math.min(Math.max(resetDayOfMonth, 1), 31);

  // Before the reset day, the open window began in the previous month.
  let windowYear = year;
  let windowMonth = month;
  if (day < Math.min(resetDay, daysInMonth(year, month))) {
    windowMonth -= 1;
    if (windowMonth === 0) {
      windowMonth = 12;
      windowYear -= 1;
    }
  }

  const windowDay = Math.min(resetDay, daysInMonth(windowYear, windowMonth));
  return `${windowYear}-${pad(windowMonth)}-${pad(windowDay)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
