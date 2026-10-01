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
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import { suspensionReason } from '@auth/onboarding/domain/enforcement-stage';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import { ARREARS_REPOSITORY, type ArrearsRepository } from './arrears.repository';
import { EnforcementAudit } from './enforcement-audit';
import { EnforcementNoticeService } from './enforcement-notice.service';
import { EnforcementPlanService, type EnforcementPlan, type PlanRow } from './enforcement-plan.service';
import { EnforcementRestoreService } from './enforcement-restore.service';
import {
  ENFORCEMENT_RUN_REPOSITORY,
  type EnforcementRunRepository,
  type RunStats,
} from './enforcement-run.repository';
import {
  ENFORCEMENT_SETTINGS_REPOSITORY,
  type EnforcementSettingsRepository,
} from './enforcement-settings.repository';
import {
  TENANT_SUSPENSION_REPOSITORY,
  type TenantSuspensionRepository,
} from './tenant-suspension.repository';
import {
  MAX_SUSPEND_ATTEMPTS,
  SYSTEM_ENFORCEMENT_ACTOR,
  TenantSuspensionService,
} from './tenant-suspension.service';

export const ENFORCEMENT_SWEEP_LOCK_ID = 8_246_113_070_003;
const TICK_INTERVAL_MS = 15 * 60 * 1000;
const FIRST_TICK_DELAY_MS = 60 * 1000;
const DAILY_PASS_FROM_HOUR = 8;

export type DailyOutcome =
  | { ran: false; skipped: 'off' | 'paused' | 'already_ran' | 'too_early' }
  | ({ ran: true } & RunStats);

export type SweepSummary = { restored: number; resumed: number; daily: DailyOutcome };

const SKIPPED_TICK: SweepSummary = {
  restored: 0,
  resumed: 0,
  daily: { ran: false, skipped: 'already_ran' },
};

const lagosHourFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  hour: '2-digit',
  hourCycle: 'h23',
});

function lagosHour(at: Date): number {
  return Number(lagosHourFormat.format(at));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown';
}

@Injectable()
export class EnforcementSweepService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EnforcementSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private starter: NodeJS.Timeout | null = null;
  private running = false;
  private readonly reportedIncomplete = new Set<string>();

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(ENFORCEMENT_SETTINGS_REPOSITORY) private readonly settings: EnforcementSettingsRepository,
    @Inject(EnforcementPlanService) private readonly planner: EnforcementPlanService,
    @Inject(TenantSuspensionService) private readonly suspension: TenantSuspensionService,
    @Inject(TENANT_SUSPENSION_REPOSITORY) private readonly suspensions: TenantSuspensionRepository,
    @Inject(EnforcementNoticeService) private readonly notices: EnforcementNoticeService,
    @Inject(EnforcementRestoreService) private readonly restoreService: EnforcementRestoreService,
    @Inject(ENFORCEMENT_RUN_REPOSITORY) private readonly runs: EnforcementRunRepository,
    @Inject(ARREARS_REPOSITORY) private readonly arrears: ArrearsRepository,
    @Inject(EnforcementAudit) private readonly audit: EnforcementAudit,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== 'mikro-orm') return;
    const tick = () => sweepSafely(this.logger, 'enforcement', () => this.run());
    this.starter = setTimeout(() => {
      void tick();
      this.timer = setInterval(tick, TICK_INTERVAL_MS);
    }, FIRST_TICK_DELAY_MS);
  }

  onApplicationShutdown(): void {
    if (this.starter) clearTimeout(this.starter);
    if (this.timer) clearInterval(this.timer);
  }

  async run(now: Date = new Date()): Promise<SweepSummary> {
    if (this.running) return SKIPPED_TICK;
    this.running = true;
    try {
      return await this.exclusively(() => this.tick(now));
    } finally {
      this.running = false;
    }
  }

  private async exclusively(task: () => Promise<SweepSummary>): Promise<SweepSummary> {
    if (this.config.persistence.backend !== 'mikro-orm') return task();
    const orm = await getAuthOrm(this.config.db);
    const result = await runIfLockFree(orm, ENFORCEMENT_SWEEP_LOCK_ID, task);
    return result.acquired ? result.value : SKIPPED_TICK;
  }

  private async tick(now: Date): Promise<SweepSummary> {
    const restored = await this.guarded('restore', 0, () => this.restoreSafetyNet());
    const resumed = await this.guarded('resume', 0, () => this.resumeIncomplete());
    const daily = await this.guarded<DailyOutcome>('daily', { ran: false, skipped: 'already_ran' }, () =>
      this.dailyPassIfDue(now, restored),
    );
    return { restored, resumed, daily };
  }

  private async guarded<T>(step: string, fallback: T, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      this.logger.error(`enforcement_${step}_failed:${errorText(error)}`);
      return fallback;
    }
  }

  private async restoreSafetyNet(): Promise<number> {
    for (const tenantId of await this.arrears.tenantsWithOpen()) {
      await this.guarded('arrears', 0, () => this.restoreService.settleArrears(tenantId));
    }
    let restored = 0;
    const rows = (await this.suspensions.findAll()).filter((row) => row.cause === 'non_payment');
    for (const row of rows) {
      const done = await this.guarded('restore_tenant', false, () =>
        this.restoreService.restoreIfClear(row.tenantId, 'sweep'),
      );
      if (done) restored += 1;
    }
    return restored;
  }

  private async resumeIncomplete(): Promise<number> {
    let resumed = 0;
    for (const item of await this.suspension.listIncomplete()) {
      if (item.phase === 'suspend' && item.attempts >= MAX_SUSPEND_ATTEMPTS) {
        await this.reportIncomplete(item.tenantId, item.attempts);
        continue;
      }
      await this.guarded('resume_tenant', undefined, () => this.resumeOne(item.tenantId, item.phase));
      resumed += 1;
    }
    return resumed;
  }

  private async resumeOne(tenantId: string, phase: 'suspend' | 'restore'): Promise<void> {
    const before = await this.suspensions.findOne(tenantId);
    const result = await this.suspension.resume(tenantId);
    if (phase === 'restore' && before?.cause === 'non_payment' && result.status === 'complete' && !result.busy) {
      await this.restoreService.announce(before, result.counts, 'sweep');
    }
  }

  private async reportIncomplete(tenantId: string, attempts: number): Promise<void> {
    if (this.reportedIncomplete.has(tenantId)) return;
    this.reportedIncomplete.add(tenantId);
    const stored = await this.suspensions.findOne(tenantId);
    await this.audit.suspensionIncomplete({ tenantId, attempts, error: stored?.cascadeLastError ?? null });
  }

  private async dailyPassIfDue(now: Date, restored: number): Promise<DailyOutcome> {
    if (lagosHour(now) < DAILY_PASS_FROM_HOUR) return { ran: false, skipped: 'too_early' };
    const today = lagosDate(now);
    const off = await this.offReason();
    if (off) {
      await this.runs.recordSkip(today, off);
      return { ran: false, skipped: off };
    }
    const runId = await this.runs.claim(today);
    if (!runId) return { ran: false, skipped: 'already_ran' };

    try {
      const stats = await this.dailyPass(now, restored);
      await this.runs.finish(runId, stats);
      await this.audit.run({ runDate: today, ...stats });
      return { ran: true, ...stats };
    } catch (error) {
      await this.runs.fail(runId, errorText(error));
      throw error;
    }
  }

  private async offReason(): Promise<'off' | 'paused' | null> {
    const settings = await this.settings.get();
    if (!settings.autoSuspendEnabled) return 'off';
    return settings.paused ? 'paused' : null;
  }

  private async dailyPass(now: Date, restored: number): Promise<RunStats> {
    const plan = await this.planner.plan(now);
    const notified = await this.sendNotices(plan);
    const suspended = await this.suspendEligible(plan);
    await this.reconcileSuspended();
    const capped = plan.deferred.filter((entry) => entry.why === 'capped').length;
    return { notified, suspended, restored, capped };
  }

  private async sendNotices(plan: EnforcementPlan): Promise<number> {
    const rows = new Map(plan.rows.map((row) => [row.tenantId, row]));
    let sent = 0;
    for (const notice of plan.wouldNotify) {
      const row = rows.get(notice.tenantId);
      if (notice.alreadySent || !row) continue;
      if (await this.offReason()) break;
      const outcome = await this.guarded('notice', 'failed', () =>
        this.notices.sendScheduled({
          tenantId: row.tenantId,
          kind: notice.kind,
          unpaidSince: row.dueDate,
          graceEndsOn: row.graceEndsOn,
          graceDays: plan.settings.graceDays,
          owedKobo: row.owedKobo,
          daysLeft: notice.daysLeft,
          today: plan.today,
        }),
      );
      if (outcome === 'sent') sent += 1;
    }
    return sent;
  }

  private async suspendEligible(plan: EnforcementPlan): Promise<number> {
    let suspended = 0;
    for (const row of plan.wouldSuspend) {
      if (await this.offReason()) break;
      const done = await this.guarded('suspend_tenant', false, () =>
        this.suspendOne(row, plan.settings.graceDays),
      );
      if (done) suspended += 1;
    }
    return suspended;
  }

  private async suspendOne(row: PlanRow, graceDays: number): Promise<boolean> {
    if (!(await this.stillOwesSince(row))) return false;
    if (await this.suspensions.findOne(row.tenantId)) return false;

    const reason = suspensionReason(row.dueDate, graceDays);
    const result = await this.suspension.suspend(row.tenantId, {
      cause: 'non_payment',
      reason,
      actor: SYSTEM_ENFORCEMENT_ACTOR,
      unpaidSince: row.dueDate,
      graceDays,
    });
    const stored = await this.suspensions.findOne(row.tenantId);
    if (result.busy || stored?.cause !== 'non_payment' || stored.suspendedBy !== SYSTEM_ENFORCEMENT_ACTOR.id) {
      return false;
    }

    await this.audit.autoSuspended({
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      reason,
      unpaidSince: row.dueDate,
      graceDays,
      owedNgn: koboToNgn(row.owedKobo),
      counts: result.counts,
      cascadeStatus: result.status === 'complete' ? 'complete' : stored.cascadeStatus,
    });
    await this.guarded('suspended_notice', undefined, async () => {
      await this.notices.sendSuspended({
        tenantId: row.tenantId,
        suspendedAt: stored.suspendedAt,
        unpaidSince: row.dueDate,
        graceDays,
      });
    });
    return true;
  }

  private async stillOwesSince(row: PlanRow): Promise<boolean> {
    const items = await this.arrears.openItems(row.tenantId);
    return items.length > 0 && items[0].dueDate === row.dueDate;
  }

  private async reconcileSuspended(): Promise<void> {
    for (const row of await this.suspensions.findAll()) {
      if (row.cascadeStatus !== 'complete') continue;
      await this.guarded('reconcile_tenant', undefined, async () => {
        await this.suspension.reconcile(row.tenantId);
      });
    }
  }
}
