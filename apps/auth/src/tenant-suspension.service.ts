import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import { AccessChangeNotifier } from './access-resolver';
import { SESSION_STORE, type SessionStore } from './contexts/auth/session/domain/ports/session-store.port';
import { USER_REPOSITORY, type UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { FleetFactsService, type TenantHoldCounts } from './fleet-facts.service';
import { SIM_CHANGED_EVENT_PUBLISHER, emitSimChanged, type SimChangedEventPublisher } from './sim-changed-event.publisher';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import {
  TENANT_ASSET_STORE,
  defaultTenantAssetStore,
  type HoldCause,
  type TenantAssetStore,
} from './tenant-asset-store';
import {
  TENANT_SUSPENSION_REPOSITORY,
  type AssetCounts,
  type CascadeProgress,
  type CascadeStatus,
  type CascadeStep,
  type StoredTenantSuspension,
  type SuspensionCause,
  type TenantSuspensionRepository,
} from './tenant-suspension.repository';

export type Actor = { id: string; name: string; role: string };
export type { AssetCounts, SuspensionCause };

export const SYSTEM_ENFORCEMENT_ACTOR: Actor = {
  id: 'system',
  name: 'Automatic billing enforcement',
  role: 'system',
};

export const MAX_SUSPEND_ATTEMPTS = 10;
const SIM_EVENT_BATCH = 25;

export type CascadeResult = {
  tenantId: string;
  cause: SuspensionCause;
  status: 'complete' | 'partial';
  counts: AssetCounts;
  failedStep?: CascadeStep;
  error?: string;
  busy?: boolean;
};

export type RestoreResult = CascadeResult & { restored: boolean; skipped?: 'manual_hold' | 'not_suspended' };

type SuspendOptions = {
  cause: SuspensionCause;
  reason: string;
  actor: Actor;
  unpaidSince?: string;
  graceDays?: number;
};

type Phase = 'suspend' | 'restore';

const emptyCounts = (): AssetCounts => ({ users: 0, devices: 0, sims: 0, vehicles: 0, shareLinks: 0 });

const holdCauseOf = (cause: SuspensionCause): HoldCause => (cause === 'manual' ? 'tenant_manual' : 'non_payment');

const releaseCauses = (cause: SuspensionCause): HoldCause[] =>
  cause === 'manual' ? ['non_payment', 'tenant_manual'] : ['non_payment'];

const phaseOf = (status: CascadeStatus): Phase =>
  status === 'restoring' || status === 'restore_partial' ? 'restore' : 'suspend';

function mergeCounts(into: Partial<AssetCounts> | undefined, add: Partial<AssetCounts>): AssetCounts {
  const base = { ...emptyCounts(), ...into };
  for (const key of Object.keys(add) as Array<keyof AssetCounts>) base[key] += add[key] ?? 0;
  return base;
}

function fleetCounts(counts: TenantHoldCounts): Partial<AssetCounts> {
  return { devices: counts.devices, vehicles: counts.vehicles, shareLinks: counts.shareLinks };
}

type StepOutcome = { counts: Partial<AssetCounts> } | { error: string };

@Injectable()
export class TenantSuspensionService {
  private readonly logger = new Logger(TenantSuspensionService.name);
  private readonly store: TenantAssetStore;

  constructor(
    @Inject(AppConfigService) config: AppConfigService,
    @Inject(TENANT_SUSPENSION_REPOSITORY) private readonly suspensions: TenantSuspensionRepository,
    @Inject(USER_REPOSITORY) users: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly sims: SimRepository,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(AccessChangeNotifier) private readonly access: AccessChangeNotifier,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(SIM_CHANGED_EVENT_PUBLISHER) private readonly simEvents: SimChangedEventPublisher,
    @Optional() @Inject(TENANT_ASSET_STORE) store?: TenantAssetStore,
  ) {
    this.store = store ?? defaultTenantAssetStore(config, users, sims);
  }

  async suspend(tenantId: string, options: SuspendOptions): Promise<CascadeResult> {
    const outcome = await this.store.withLock(tenantId, () => this.suspendLocked(tenantId, options));
    return outcome.acquired ? outcome.value : this.busy(tenantId, options.cause);
  }

  async restore(
    tenantId: string,
    options: { cause: SuspensionCause; actor: Actor },
  ): Promise<RestoreResult> {
    const outcome = await this.store.withLock(tenantId, () => this.restoreLocked(tenantId, options));
    return outcome.acquired ? outcome.value : { ...this.busy(tenantId, options.cause), restored: false };
  }

  async resume(tenantId: string): Promise<CascadeResult> {
    const outcome = await this.store.withLock(tenantId, () => this.resumeLocked(tenantId));
    return outcome.acquired ? outcome.value : this.busy(tenantId, 'non_payment');
  }

  async reconcile(tenantId: string): Promise<CascadeResult> {
    const outcome = await this.store.withLock(tenantId, () => this.reconcileLocked(tenantId));
    return outcome.acquired ? outcome.value : this.busy(tenantId, 'non_payment');
  }

  async listIncomplete(): Promise<Array<{ tenantId: string; phase: Phase; attempts: number }>> {
    const rows = await this.suspensions.findIncomplete();
    return rows.map((row) => ({
      tenantId: row.tenantId,
      phase: phaseOf(row.cascadeStatus),
      attempts: row.cascadeAttempts,
    }));
  }

  async previewAssets(tenantIds: string[]): Promise<Map<string, AssetCounts>> {
    const [local, remote] = await Promise.all([
      this.store.countHoldable(tenantIds),
      this.fleet.previewTenantHold(tenantIds),
    ]);
    return new Map(
      tenantIds.map((id) => [
        id,
        {
          ...emptyCounts(),
          users: local.get(id)?.users ?? 0,
          sims: local.get(id)?.sims ?? 0,
          ...(remote?.get(id) ? fleetCounts(remote.get(id)!) : {}),
        },
      ]),
    );
  }

  private busy(tenantId: string, cause: SuspensionCause): CascadeResult {
    return { tenantId, cause, status: 'partial', counts: emptyCounts(), busy: true, error: 'Another change for this customer is running' };
  }

  private async suspendLocked(tenantId: string, options: SuspendOptions): Promise<CascadeResult> {
    const row = { tenantId, suspendedBy: options.actor.id, reason: options.reason, cause: options.cause, unpaidSince: options.unpaidSince ?? null, graceDays: options.graceDays ?? null };
    if (options.cause === 'manual') {
      await this.suspensions.upsertManual(row);
    } else if (!(await this.suspensions.insertIfAbsent(row))) {
      return this.existingResult(tenantId, options.cause);
    }
    const stored = await this.suspensions.findOne(tenantId);
    if (!stored) return this.busy(tenantId, options.cause);
    return this.runSuspend(stored, options.actor);
  }

  private async existingResult(tenantId: string, cause: SuspensionCause): Promise<CascadeResult> {
    const stored = await this.suspensions.findOne(tenantId);
    return {
      tenantId,
      cause: stored?.cause ?? cause,
      status: stored?.cascadeStatus === 'complete' ? 'complete' : 'partial',
      counts: emptyCounts(),
    };
  }

  private async resumeLocked(tenantId: string): Promise<CascadeResult> {
    const stored = await this.suspensions.findOne(tenantId);
    if (!stored || stored.cascadeStatus === 'complete') return this.settled(tenantId, stored?.cause ?? 'non_payment');
    if (phaseOf(stored.cascadeStatus) === 'restore') return this.runRestore(stored, this.actorOf(stored), stored.cause);
    if (stored.cascadeAttempts >= MAX_SUSPEND_ATTEMPTS) return this.fromStored(stored);
    return this.runSuspend(stored, this.actorOf(stored));
  }

  private async reconcileLocked(tenantId: string): Promise<CascadeResult> {
    const stored = await this.suspensions.findOne(tenantId);
    if (!stored || stored.cascadeStatus !== 'complete') return this.settled(tenantId, stored?.cause ?? 'non_payment');
    const fresh: StoredTenantSuspension = { ...stored, cascadeProgress: {} };
    return this.runSuspend(fresh, this.actorOf(stored), true);
  }

  private settled(tenantId: string, cause: SuspensionCause): CascadeResult {
    return { tenantId, cause, status: 'complete', counts: emptyCounts() };
  }

  private fromStored(stored: StoredTenantSuspension): CascadeResult {
    return {
      tenantId: stored.tenantId,
      cause: stored.cause,
      status: 'partial',
      counts: mergeCounts(stored.cascadeProgress.counts, {}),
      error: stored.cascadeLastError ?? undefined,
    };
  }

  private actorOf(stored: StoredTenantSuspension): Actor {
    return stored.suspendedBy === SYSTEM_ENFORCEMENT_ACTOR.id
      ? SYSTEM_ENFORCEMENT_ACTOR
      : { id: stored.suspendedBy, name: stored.suspendedBy, role: 'system_admin' };
  }

  private async runSuspend(
    stored: StoredTenantSuspension,
    actor: Actor,
    reconciling = false,
  ): Promise<CascadeResult> {
    const progress: CascadeProgress = { ...stored.cascadeProgress };
    const holdCause = holdCauseOf(stored.cause);
    const errors: Partial<Record<CascadeStep, string>> = {};

    const usersWereDone = progress.users === 'done';
    await this.runStep('users', progress, errors, () => this.suspendUsers(stored, holdCause));
    if (!usersWereDone && !reconciling && progress.users === 'done') await this.publishSuspended(stored);
    await this.runStep('fleet', progress, errors, () => this.suspendFleet(stored, actor));
    await this.runStep('sims', progress, errors, () => this.suspendSims(stored, holdCause));

    return this.finishSuspend(stored, progress, errors, reconciling);
  }

  private async runStep(
    step: CascadeStep,
    progress: CascadeProgress,
    errors: Partial<Record<CascadeStep, string>>,
    work: () => Promise<StepOutcome>,
  ): Promise<void> {
    if (progress[step] === 'done') return;
    const outcome = await this.guarded(work);
    if ('error' in outcome) {
      progress[step] = 'failed';
      errors[step] = outcome.error;
      return;
    }
    progress[step] = 'done';
    progress.counts = mergeCounts(progress.counts, outcome.counts);
  }

  private async guarded(work: () => Promise<StepOutcome>): Promise<StepOutcome> {
    try {
      return await work();
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'unknown error' };
    }
  }

  private async suspendUsers(stored: StoredTenantSuspension, holdCause: HoldCause): Promise<StepOutcome> {
    if (stored.cause === 'manual') await this.store.retagUsers(stored.tenantId, 'non_payment', 'tenant_manual');
    const ids = await this.store.holdUsers(stored.tenantId, holdCause);
    await Promise.all(ids.map((id) => this.sessions.deleteAllForUser(id)));
    ids.forEach((id) => this.access.changed(id));
    return { counts: { users: ids.length } };
  }

  private async suspendFleet(stored: StoredTenantSuspension, actor: Actor): Promise<StepOutcome> {
    const result = await this.fleet.suspendTenantAssets(stored.tenantId, {
      cause: stored.cause,
      reason: stored.reason,
      actor: { id: actor.id, name: actor.name },
    });
    return result.ok ? { counts: fleetCounts(result) } : { error: result.message };
  }

  private async suspendSims(stored: StoredTenantSuspension, holdCause: HoldCause): Promise<StepOutcome> {
    if (stored.cause === 'manual') {
      await this.store.retagSims(stored.tenantId, 'non_payment', 'tenant_manual', stored.reason);
    }
    const ids = await this.store.holdSims(stored.tenantId, holdCause, stored.reason);
    await this.announceSims(ids, 'suspended');
    return { counts: { sims: ids.length } };
  }

  private async announceSims(ids: string[], action: 'suspended' | 'updated'): Promise<void> {
    for (let i = 0; i < ids.length; i += SIM_EVENT_BATCH) {
      await Promise.all(
        ids.slice(i, i + SIM_EVENT_BATCH).map(async (id) => {
          const sim = await this.sims.findById(id);
          if (sim) await emitSimChanged(this.simEvents, sim, action);
        }),
      );
    }
  }

  private async finishSuspend(
    stored: StoredTenantSuspension,
    progress: CascadeProgress,
    errors: Partial<Record<CascadeStep, string>>,
    reconciling: boolean,
  ): Promise<CascadeResult> {
    const counts = mergeCounts(progress.counts, {});
    const failedStep = (['users', 'fleet', 'sims'] as const).find((step) => progress[step] !== 'done');

    if (!failedStep && reconciling) {
      return { tenantId: stored.tenantId, cause: stored.cause, status: 'complete', counts };
    }

    if (!failedStep) {
      await this.suspensions.setCascade(stored.tenantId, {
        status: 'complete',
        progress,
        attempts: stored.cascadeAttempts,
        lastError: null,
        completedAt: stored.cascadeCompletedAt ?? new Date(),
      });
      await this.publishAssets(stored, 'tenant.assets.suspended', counts, true);
      return { tenantId: stored.tenantId, cause: stored.cause, status: 'complete', counts };
    }

    const error = errors[failedStep] ?? 'unknown error';
    await this.suspensions.setCascade(stored.tenantId, {
      status: 'partial',
      progress,
      attempts: stored.cascadeAttempts + 1,
      lastError: `${failedStep}: ${error}`,
      completedAt: null,
    });
    if (!reconciling && stored.cascadeAttempts === 0) await this.publishAssets(stored, 'tenant.assets.suspended', counts, false);
    return { tenantId: stored.tenantId, cause: stored.cause, status: 'partial', counts, failedStep, error };
  }

  private async restoreLocked(
    tenantId: string,
    options: { cause: SuspensionCause; actor: Actor },
  ): Promise<RestoreResult> {
    const stored = await this.suspensions.findOne(tenantId);
    if (!stored) return { ...this.settled(tenantId, options.cause), restored: false, skipped: 'not_suspended' };
    if (options.cause === 'non_payment' && stored.cause === 'manual') {
      return { ...this.settled(tenantId, 'manual'), restored: false, skipped: 'manual_hold' };
    }
    await this.recordWaiver(stored, options);
    const restoring = phaseOf(stored.cascadeStatus) === 'restore'
      ? stored
      : await this.enterRestoring(stored);
    const result = await this.runRestore(restoring, options.actor, options.cause);
    return { ...result, restored: result.status === 'complete' };
  }

  private async enterRestoring(stored: StoredTenantSuspension): Promise<StoredTenantSuspension> {
    const next: StoredTenantSuspension = {
      ...stored,
      cascadeStatus: 'restoring',
      cascadeProgress: {},
      cascadeAttempts: 0,
      cascadeLastError: null,
      cascadeCompletedAt: null,
    };
    await this.suspensions.setCascade(stored.tenantId, {
      status: 'restoring',
      progress: {},
      attempts: 0,
      lastError: null,
      completedAt: null,
    });
    return next;
  }

  private async recordWaiver(
    stored: StoredTenantSuspension,
    options: { cause: SuspensionCause; actor: Actor },
  ): Promise<void> {
    if (options.cause !== 'manual' || !stored.unpaidSince) return;
    await this.store.addWaiver(stored.tenantId, stored.unpaidSince, options.actor.id, 'Staff reinstated while payment was outstanding');
  }

  private async runRestore(
    stored: StoredTenantSuspension,
    actor: Actor,
    cause: SuspensionCause,
  ): Promise<RestoreResult> {
    const progress: CascadeProgress = { ...stored.cascadeProgress };
    const errors: Partial<Record<CascadeStep, string>> = {};
    const causes = releaseCauses(cause);

    await this.runStep('users', progress, errors, () => this.restoreUsers(stored, causes, actor));
    await this.runStep('fleet', progress, errors, () => this.restoreFleet(stored, cause));
    await this.runStep('sims', progress, errors, () => this.restoreSims(stored, causes));

    return this.finishRestore(stored, progress, errors);
  }

  private async restoreUsers(stored: StoredTenantSuspension, causes: HoldCause[], actor: Actor): Promise<StepOutcome> {
    const ids = await this.store.releaseUsers(stored.tenantId, causes);
    ids.forEach((id) => this.access.changed(id));
    await this.publishReinstated(stored, actor);
    return { counts: { users: ids.length } };
  }

  private async restoreFleet(stored: StoredTenantSuspension, cause: SuspensionCause): Promise<StepOutcome> {
    const result = await this.fleet.reinstateTenantAssets(stored.tenantId, cause);
    return result.ok ? { counts: fleetCounts(result) } : { error: result.message };
  }

  private async restoreSims(stored: StoredTenantSuspension, causes: HoldCause[]): Promise<StepOutcome> {
    const ids = await this.store.releaseSims(stored.tenantId, causes);
    await this.announceSims(ids, 'updated');
    return { counts: { sims: ids.length } };
  }

  private async finishRestore(
    stored: StoredTenantSuspension,
    progress: CascadeProgress,
    errors: Partial<Record<CascadeStep, string>>,
  ): Promise<RestoreResult> {
    const counts = mergeCounts(progress.counts, {});
    const failedStep = (['users', 'fleet', 'sims'] as const).find((step) => progress[step] !== 'done');
    const base = { tenantId: stored.tenantId, cause: stored.cause, counts };

    if (!failedStep) {
      await this.suspensions.remove(stored.tenantId);
      await this.publishAssets(stored, 'tenant.assets.restored', counts, true);
      return { ...base, status: 'complete', restored: true };
    }

    const error = errors[failedStep] ?? 'unknown error';
    await this.suspensions.setCascade(stored.tenantId, {
      status: 'restore_partial',
      progress,
      attempts: stored.cascadeAttempts + 1,
      lastError: `${failedStep}: ${error}`,
      completedAt: null,
    });
    return { ...base, status: 'partial', failedStep, error, restored: false };
  }

  private async publishSuspended(stored: StoredTenantSuspension): Promise<void> {
    await this.publish(stored.tenantId, 'tenant.suspended', stored.suspendedBy, {
      tenant_id: stored.tenantId,
      status: 'suspended',
      cause: stored.cause,
      reason: stored.reason,
      suspended_at: stored.suspendedAt.toISOString(),
      unpaid_since: stored.unpaidSince,
    });
  }

  private async publishReinstated(stored: StoredTenantSuspension, actor: Actor): Promise<void> {
    await this.publish(stored.tenantId, 'tenant.reinstated', actor.id, {
      tenant_id: stored.tenantId,
      status: 'active',
      cause: stored.cause,
      restored_by: actor.id === SYSTEM_ENFORCEMENT_ACTOR.id ? 'payment' : 'staff',
    });
  }

  private async publishAssets(
    stored: StoredTenantSuspension,
    type: 'tenant.assets.suspended' | 'tenant.assets.restored',
    counts: AssetCounts,
    complete: boolean,
  ): Promise<void> {
    await this.publish(stored.tenantId, type, stored.suspendedBy, {
      tenant_id: stored.tenantId,
      cause: stored.cause,
      counts: {
        users: counts.users,
        devices: counts.devices,
        sims: counts.sims,
        vehicles: counts.vehicles,
        share_links: counts.shareLinks,
      },
      complete,
    });
  }

  // A failed announcement must not undo a hold that is already written.
  private async publish(tenantId: string, type: string, actorId: string, data: Record<string, unknown>): Promise<void> {
    try {
      await this.bus.publish(`tm.${tenantId}.${type}`, {
        id: randomUUID(),
        type,
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: tenantId,
        actor: { id: actorId },
        data,
      });
    } catch (error) {
      this.logger.warn(`${type}_publish_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}
