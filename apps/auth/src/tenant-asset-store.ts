import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { runIfLockFree } from '@shared/db';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import type { SimRepository } from './sim.repository';

export type HoldCause = 'non_payment' | 'tenant_manual';
export type LockOutcome<T> = { acquired: false } | { acquired: true; value: T };

/**
 * Set-based holds on the rows auth owns for a tenant: users and SIMs.
 * Every write is guarded by the cause column, so a hold only takes assets that
 * are active and unheld, and a release only gives back what a hold took.
 */
export interface TenantAssetStore {
  holdUsers(tenantId: string, cause: HoldCause): Promise<string[]>;
  releaseUsers(tenantId: string, causes: HoldCause[]): Promise<string[]>;
  retagUsers(tenantId: string, from: HoldCause, to: HoldCause): Promise<number>;
  holdSims(tenantId: string, cause: HoldCause, reason: string): Promise<string[]>;
  releaseSims(tenantId: string, causes: HoldCause[]): Promise<string[]>;
  retagSims(tenantId: string, from: HoldCause, to: HoldCause, reason: string): Promise<number>;
  clearHolds(tenantId: string): Promise<void>;
  countHoldable(tenantIds: string[]): Promise<Map<string, { users: number; sims: number }>>;
  addWaiver(tenantId: string, unpaidSince: string, createdBy: string, reason: string): Promise<void>;
  withLock<T>(tenantId: string, task: () => Promise<T>): Promise<LockOutcome<T>>;
}

export const TENANT_ASSET_STORE = Symbol('TENANT_ASSET_STORE');

const TENANT_LOCK_BASE = 8_246_200_000_000;
const SIM_REASON_MAX = 255;

export function tenantLockId(tenantId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < tenantId.length; i += 1) {
    hash ^= tenantId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return TENANT_LOCK_BASE + hash;
}

const causeList = (causes: HoldCause[]) => `{${causes.join(',')}}`;

@Injectable()
export class MikroTenantAssetStore implements TenantAssetStore {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async holdUsers(tenantId: string, cause: HoldCause): Promise<string[]> {
    return this.ids(
      `update auth_users set account_status = 'disabled', suspension_cause = ?
       where tenant_id = ? and account_status = 'enabled' and suspension_cause is null returning id`,
      [cause, tenantId],
    );
  }

  async releaseUsers(tenantId: string, causes: HoldCause[]): Promise<string[]> {
    return this.ids(
      `update auth_users set account_status = 'enabled', suspension_cause = null
       where tenant_id = ? and suspension_cause = any(?::text[]) returning id`,
      [tenantId, causeList(causes)],
    );
  }

  async retagUsers(tenantId: string, from: HoldCause, to: HoldCause): Promise<number> {
    const rows = await this.ids(
      `update auth_users set suspension_cause = ? where tenant_id = ? and suspension_cause = ? returning id`,
      [to, tenantId, from],
    );
    return rows.length;
  }

  async holdSims(tenantId: string, cause: HoldCause, reason: string): Promise<string[]> {
    return this.ids(
      `update iot_sims set pre_suspension_status = status, status = 'suspended', suspension_cause = ?,
         suspension_reason = ?, updated_at = now()
       where tenant_id = ? and suspension_cause is null and status not in ('suspended','deactivated')
       returning id`,
      [cause, reason.slice(0, SIM_REASON_MAX), tenantId],
    );
  }

  async releaseSims(tenantId: string, causes: HoldCause[]): Promise<string[]> {
    return this.ids(
      `update iot_sims set status = coalesce(pre_suspension_status, case when device_id is null then 'active' else 'assigned' end),
         pre_suspension_status = null, suspension_cause = null, suspension_reason = null, updated_at = now()
       where tenant_id = ? and status = 'suspended' and suspension_cause = any(?::text[]) returning id`,
      [tenantId, causeList(causes)],
    );
  }

  async clearHolds(tenantId: string): Promise<void> {
    await this.rows(`update auth_users set suspension_cause = null where tenant_id = ? and suspension_cause is not null`, [tenantId]);
    await this.rows(
      `update iot_sims set suspension_cause = null, pre_suspension_status = null, suspension_reason = null
       where tenant_id = ? and (suspension_cause is not null or pre_suspension_status is not null)`,
      [tenantId],
    );
  }

  async retagSims(tenantId: string, from: HoldCause, to: HoldCause, reason: string): Promise<number> {
    const rows = await this.ids(
      `update iot_sims set suspension_cause = ?, suspension_reason = ?, updated_at = now()
       where tenant_id = ? and suspension_cause = ? returning id`,
      [to, reason.slice(0, SIM_REASON_MAX), tenantId, from],
    );
    return rows.length;
  }

  async countHoldable(tenantIds: string[]): Promise<Map<string, { users: number; sims: number }>> {
    const result = new Map(tenantIds.map((id) => [id, { users: 0, sims: 0 }]));
    if (tenantIds.length === 0) return result;
    const list = `{${tenantIds.map((id) => `"${id.replace(/(["\\])/g, '\\$1')}"`).join(',')}}`;
    const users = await this.rows(
      `select tenant_id, count(*) as n from auth_users
       where tenant_id = any(?::text[]) and account_status = 'enabled' and suspension_cause is null group by tenant_id`,
      [list],
    );
    const sims = await this.rows(
      `select tenant_id, count(*) as n from iot_sims
       where tenant_id = any(?::text[]) and suspension_cause is null and status not in ('suspended','deactivated')
       group by tenant_id`,
      [list],
    );
    for (const row of users) result.get(String(row.tenant_id))!.users = Number(row.n);
    for (const row of sims) result.get(String(row.tenant_id))!.sims = Number(row.n);
    return result;
  }

  async addWaiver(tenantId: string, unpaidSince: string, createdBy: string, reason: string): Promise<void> {
    await this.rows(
      `insert into enforcement_waivers (tenant_id, unpaid_since, created_by, reason)
       values (?, ?, ?, ?) on conflict (tenant_id, unpaid_since) do nothing`,
      [tenantId, unpaidSince, createdBy, reason],
    );
  }

  async withLock<T>(tenantId: string, task: () => Promise<T>): Promise<LockOutcome<T>> {
    const orm = await getAuthOrm(this.config.db);
    return runIfLockFree(orm as never, tenantLockId(tenantId), task);
  }

  private async ids(sql: string, params: unknown[]): Promise<string[]> {
    return (await this.rows(sql, params)).map((row) => String(row.id));
  }

  private async rows(sql: string, params: unknown[]): Promise<Array<Record<string, unknown>>> {
    const orm = await getAuthOrm(this.config.db);
    return (await orm.em.getConnection().execute(sql, params)) as Array<Record<string, unknown>>;
  }
}

/**
 * Same rules over the in-memory user and SIM stores, for the in-memory backend
 * and for tests. Causes live beside the stores because their rows carry none.
 */
export class InMemoryTenantAssetStore implements TenantAssetStore {
  readonly userCauses = new Map<string, HoldCause>();
  readonly simCauses = new Map<string, HoldCause>();
  readonly simPrior = new Map<string, string>();
  readonly waivers: Array<{ tenantId: string; unpaidSince: string }> = [];
  private readonly locked = new Set<string>();

  constructor(
    private readonly users: UserRepository,
    private readonly sims: SimRepository,
  ) {}

  async holdUsers(tenantId: string, cause: HoldCause): Promise<string[]> {
    const held: string[] = [];
    for (const user of await this.users.findAllByTenant(tenantId)) {
      if (user.accountStatus !== 'enabled' || this.userCauses.has(user.id)) continue;
      await this.users.updateAccountStatus(user.id, 'disabled');
      this.userCauses.set(user.id, cause);
      held.push(user.id);
    }
    return held;
  }

  async releaseUsers(tenantId: string, causes: HoldCause[]): Promise<string[]> {
    const released: string[] = [];
    for (const user of await this.users.findAllByTenant(tenantId)) {
      const cause = this.userCauses.get(user.id);
      if (!cause || !causes.includes(cause)) continue;
      await this.users.updateAccountStatus(user.id, 'enabled');
      this.userCauses.delete(user.id);
      released.push(user.id);
    }
    return released;
  }

  async retagUsers(tenantId: string, from: HoldCause, to: HoldCause): Promise<number> {
    let moved = 0;
    for (const user of await this.users.findAllByTenant(tenantId)) {
      if (this.userCauses.get(user.id) !== from) continue;
      this.userCauses.set(user.id, to);
      moved += 1;
    }
    return moved;
  }

  async holdSims(tenantId: string, cause: HoldCause, reason: string): Promise<string[]> {
    const held: string[] = [];
    for (const sim of await this.tenantSims(tenantId)) {
      if (this.simCauses.has(sim.id) || ['suspended', 'deactivated'].includes(sim.status)) continue;
      this.simPrior.set(sim.id, sim.status);
      await this.sims.save({ ...sim, status: 'suspended', suspensionReason: reason, updatedAt: new Date() });
      this.simCauses.set(sim.id, cause);
      held.push(sim.id);
    }
    return held;
  }

  async releaseSims(tenantId: string, causes: HoldCause[]): Promise<string[]> {
    const released: string[] = [];
    for (const sim of await this.tenantSims(tenantId)) {
      const cause = this.simCauses.get(sim.id);
      if (!cause || !causes.includes(cause) || sim.status !== 'suspended') continue;
      const status = this.simPrior.get(sim.id) ?? (sim.deviceId ? 'assigned' : 'active');
      await this.sims.save({ ...sim, status, suspensionReason: null, updatedAt: new Date() });
      this.simCauses.delete(sim.id);
      this.simPrior.delete(sim.id);
      released.push(sim.id);
    }
    return released;
  }

  async retagSims(tenantId: string, from: HoldCause, to: HoldCause, reason: string): Promise<number> {
    let moved = 0;
    for (const sim of await this.tenantSims(tenantId)) {
      if (this.simCauses.get(sim.id) !== from) continue;
      this.simCauses.set(sim.id, to);
      await this.sims.save({ ...sim, suspensionReason: reason });
      moved += 1;
    }
    return moved;
  }

  async clearHolds(tenantId: string): Promise<void> {
    for (const user of await this.users.findAllByTenant(tenantId)) this.userCauses.delete(user.id);
    for (const sim of await this.tenantSims(tenantId)) {
      this.simCauses.delete(sim.id);
      this.simPrior.delete(sim.id);
    }
  }

  async countHoldable(tenantIds: string[]): Promise<Map<string, { users: number; sims: number }>> {
    const result = new Map<string, { users: number; sims: number }>();
    for (const tenantId of tenantIds) {
      const users = (await this.users.findAllByTenant(tenantId)).filter(
        (user) => user.accountStatus === 'enabled' && !this.userCauses.has(user.id),
      );
      const sims = (await this.tenantSims(tenantId)).filter(
        (sim) => !this.simCauses.has(sim.id) && !['suspended', 'deactivated'].includes(sim.status),
      );
      result.set(tenantId, { users: users.length, sims: sims.length });
    }
    return result;
  }

  async addWaiver(tenantId: string, unpaidSince: string): Promise<void> {
    this.waivers.push({ tenantId, unpaidSince });
  }

  async withLock<T>(tenantId: string, task: () => Promise<T>): Promise<LockOutcome<T>> {
    if (this.locked.has(tenantId)) return { acquired: false };
    this.locked.add(tenantId);
    try {
      return { acquired: true, value: await task() };
    } finally {
      this.locked.delete(tenantId);
    }
  }

  private async tenantSims(tenantId: string) {
    return (await this.sims.findAll({ tenantId, limit: 100000 })).items;
  }
}

export function defaultTenantAssetStore(
  config: AppConfigService,
  users: UserRepository,
  sims: SimRepository,
): TenantAssetStore {
  return config.persistence.backend === 'in-memory'
    ? new InMemoryTenantAssetStore(users, sims)
    : new MikroTenantAssetStore(config);
}

